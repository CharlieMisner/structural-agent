import json
from pathlib import Path
import subprocess
import urllib.error
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException

from server.services.forte.client import (
    authenticate_forte,
    init_forte_project_file,
    _make_request,
    _get_forte_token,
    _get_project_file_id,
    API_BASE_URL,
)
from server.services.forte.forte_joist import (
    _open_file,
    _open_job,
    _add_floor_joist,
    _selected_job_tree_node_changed,
    _modify_member_name,
    _modify_interior_span,
    _save_file,
    _extract_solution_summary,
    add_forte_floor_joist_to_project,
)


def test_authenticate_forte_success():
    fake_token_response = json.dumps({
        "access_token": "fake_token_123",
        "expires_in": 3600,
        "token_type": "bearer",
        "userName": "test@example.com",
    })
    mock_proc = MagicMock(stdout=fake_token_response)

    with patch("subprocess.run", return_value=mock_proc):
        res = authenticate_forte("test@example.com", "password123")
        assert res["access_token"] == "fake_token_123"
        assert res["username"] == "test@example.com"


def test_authenticate_forte_errors():
    # 401 error description
    err_resp = json.dumps({"error_description": "Invalid credentials"})
    with patch("subprocess.run", return_value=MagicMock(stdout=err_resp)):
        with pytest.raises(HTTPException) as exc:
            authenticate_forte("u", "p")
        assert exc.value.status_code == 401
        assert "Invalid credentials" in exc.value.detail

    # 401 error key
    err_resp2 = json.dumps({"error": "unauthorized"})
    with patch("subprocess.run", return_value=MagicMock(stdout=err_resp2)):
        with pytest.raises(HTTPException) as exc:
            authenticate_forte("u", "p")
        assert exc.value.status_code == 401

    # 400 invalid json
    with patch("subprocess.run", return_value=MagicMock(stdout="non-json response")):
        with pytest.raises(HTTPException) as exc:
            authenticate_forte("u", "p")
        assert exc.value.status_code == 400

    # 500 unexpected exception
    with patch("subprocess.run", side_effect=Exception("Curl failed")):
        with pytest.raises(HTTPException) as exc:
            authenticate_forte("u", "p")
        assert exc.value.status_code == 500


def test_init_forte_project_file_existing(tmp_path: Path):
    statikor_dir = tmp_path / ".statikor"
    statikor_dir.mkdir(parents=True)
    with open(statikor_dir / "project.json", "w", encoding="utf-8") as f:
        json.dump({
            "cloud-software": [{
                "id": "forteweb",
                "fileId": 999,
                "projectFileTreeId": 999,
            }]
        }, f)

    res = init_forte_project_file(str(tmp_path))
    assert res["fileId"] == 999


def test_init_forte_project_file_new(tmp_path: Path):
    fs_data = json.dumps({
        "allTreeItems": [
            {"id": 42, "text": "Root"},
        ]
    })
    add_data = json.dumps({
        "postResponseData": {
            "ApplicationData": {
                "ProjectManagerData": {
                    "ProjectFileTreeID": 555
                }
            }
        }
    })

    def mock_subp(cmd, **kwargs):
        if "GetAllFileSystemData" in str(cmd):
            return MagicMock(stdout=fs_data)
        if "AddNewFile" in str(cmd):
            return MagicMock(stdout=add_data)
        return MagicMock(stdout="{}")

    with patch("subprocess.run", side_effect=mock_subp):
        res = init_forte_project_file(str(tmp_path), token="fake_token", username="usr")
        assert res["fileId"] == 555
        assert res["forteUserRootId"] == 42


def test_init_forte_project_file_no_token(tmp_path: Path):
    with patch("pathlib.Path.home", return_value=tmp_path):
        with pytest.raises(HTTPException) as exc:
            init_forte_project_file(str(tmp_path))
        assert exc.value.status_code == 401


def test_make_request_success():
    fake_body = b'{"status": "ok"}'
    mock_resp = MagicMock()
    mock_resp.read.return_value = fake_body
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = _make_request("http://api.test", "tok", {"key": "val"})
        assert res == {"status": "ok"}


def test_make_request_empty():
    mock_resp = MagicMock()
    mock_resp.read.return_value = b''
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = _make_request("http://api.test", "tok", {})
        assert res == {}


def test_make_request_http_error():
    err = urllib.error.HTTPError(
        url="http://api.test",
        code=403,
        msg="Forbidden",
        hdrs={},
        fp=MagicMock(read=MagicMock(return_value=b'5 locked_self'))
    )
    with patch("urllib.request.urlopen", side_effect=err):
        with pytest.raises(HTTPException) as exc:
            _make_request("http://api.test", "tok", {})
        assert exc.value.status_code == 403
        assert "5 locked_self" in exc.value.detail


def test_make_request_url_error():
    err = urllib.error.URLError(reason="Connection refused")
    with patch("urllib.request.urlopen", side_effect=err):
        with pytest.raises(HTTPException) as exc:
            _make_request("http://api.test", "tok", {})
        assert exc.value.status_code == 500


def test_get_forte_token_keychain():
    with patch("subprocess.run", return_value=MagicMock(stdout="keychain_token_123\n")):
        assert _get_forte_token() == "keychain_token_123"

    with patch("subprocess.run", side_effect=subprocess.CalledProcessError(1, ["cmd"])):
        with pytest.raises(Exception) as exc:
            _get_forte_token()
        assert "Could not find ForteWEB token" in str(exc.value)


def test_get_project_file_id(tmp_path: Path):
    statikor_dir = tmp_path / ".statikor"
    statikor_dir.mkdir(parents=True)
    with open(statikor_dir / "project.json", "w", encoding="utf-8") as f:
        json.dump({"cloud-software": [{"id": "forteweb", "fileId": 777}]}, f)

    with patch("server.services.project.ACTIVE_PROJECT_PATH", str(tmp_path)):
        assert _get_project_file_id() == 777

    with (
        patch("server.services.project.ACTIVE_PROJECT_PATH", "/nonexistent_root_dir"),
        patch("os.path.exists", return_value=False),
    ):
        with pytest.raises(FileNotFoundError):
            _get_project_file_id()



def sample_prd():
    return {
        "IsPostResponseDataObject": 1,
        "FileHash": "hash",
        "ApplicationData": {
            "DataVersion": "1",
            "BuildNumber": 1,
            "MemberManagerData": {
                "SelectedContainerID": 0,
                "SelectedMemberID": 1,
                "MemberContainers": [{
                    "ContainerID": 0,
                    "LevelSettingsData": {},
                    "Members": [{
                        "MemberID": 10,
                        "IDTag": 1,
                        "MemberName": "Joist 1",
                        "MemberType": 1,
                        "MemberTypeStringTag": "Joist",
                        "StructuralSystem": 1,
                        "StructuralSystemStringTag": "Sys",
                        "IsDesignable": True,
                        "MemberLength": 120.0,
                        "Depth": 9.5,
                        "Spacing": 16.0,
                        "Plies": 1,
                    }]
                }]
            },
            "ProjectManagerData": {
                "ProjectFileTreeID": 100,
                "ProjectName": "Proj",
            }
        },
        "MemberData": {
            "MemberIDTag": 1,
            "DataVersion": "1",
            "BuildNumber": 1,
            "SolutionsData": {
                "SolutionList": [{
                    "ProductLabel": "TJI 110",
                    "ProductID": 1,
                    "ProductPasses": True,
                    "IsSelected": True,
                    "IsSuggested": True,
                    "Depth": 9.5,
                    "Plies": 1,
                    "Spacing": 16.0,
                    "Series": "TJI",
                }],
                "DesignResultsProductLabel": "TJI 110",
                "DesignResultsProductPasses": True,
            }
        }
    }


def test_forte_joist_steps():
    prd = sample_prd()

    with patch("server.services.forte.forte_joist._make_request", return_value={"postResponseData": prd}):
        # Open file
        res = _open_file("tok", 100, "sess")
        assert "postResponseData" in res

        # Open job
        res_job = _open_job("tok", 100, "sess")
        assert res_job["FileHash"] == "hash"

        # Add floor joist
        res_add = _add_floor_joist("tok", prd)
        assert res_add["FileHash"] == "hash"

        # Node changed
        res_node = _selected_job_tree_node_changed("tok", prd)
        assert res_node["FileHash"] == "hash"

        # Modify name
        res_name = _modify_member_name("tok", prd, 10, "New Name")
        assert res_name["FileHash"] == "hash"

        # Modify span
        res_span = _modify_interior_span("tok", prd, 144.0, 0)
        assert res_span["FileHash"] == "hash"

        # Save file
        _save_file("tok", prd)


def test_open_file_locked_self():
    with patch(
        "server.services.forte.forte_joist._make_request",
        side_effect=HTTPException(status_code=403, detail="5 locked_self")
    ):
        with pytest.raises(RuntimeError) as exc:
            _open_file("tok", 100, "sess")
        assert "file is open in browser" in str(exc.value)


def test_extract_solution_summary():
    prd = sample_prd()
    summary = _extract_solution_summary(prd)
    assert summary["status"] == "success"
    assert summary["member_id"] == 10
    assert summary["selected_product"] == "TJI 110"
    assert summary["product_passes"] is True

    # Malformed PRD
    summary_bad = _extract_solution_summary({"invalid": "data"})
    assert summary_bad["status"] == "success"
    assert summary_bad["selected_product"] is None


def test_add_forte_floor_joist_to_project_full():
    prd = sample_prd()

    with (
        patch("server.services.forte.forte_joist._get_forte_token", return_value="tok"),
        patch("server.services.forte.forte_joist._get_project_file_id", return_value=100),
        patch("server.services.forte.forte_joist._open_file"),
        patch("server.services.forte.forte_joist._open_job", return_value=prd),
        patch("server.services.forte.forte_joist._add_floor_joist", return_value=prd),
        patch("server.services.forte.forte_joist._selected_job_tree_node_changed", return_value=prd),
        patch("server.services.forte.forte_joist._save_file"),
        patch("server.services.forte.forte_joist._modify_member_name", return_value=prd),
        patch("server.services.forte.forte_joist._modify_interior_span", return_value=prd),
    ):
        res = add_forte_floor_joist_to_project(
            token="tok",
            file_tree_item_id=100,
            member_name="Custom Joist",
            span=144.0,
        )
        assert res["status"] == "success"
        assert res["selected_product"] == "TJI 110"


def test_add_forte_floor_joist_to_project_locked_error():
    with (
        patch("server.services.forte.forte_joist._get_forte_token", return_value="tok"),
        patch("server.services.forte.forte_joist._get_project_file_id", return_value=100),
        patch("server.services.forte.forte_joist._open_file", side_effect=RuntimeError("file is open in browser")),
    ):
        res = add_forte_floor_joist_to_project(token="tok", file_tree_item_id=100)
        assert res["status"] == "error"
        assert "file is open in browser" in res["message"]

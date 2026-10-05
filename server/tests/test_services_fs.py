import pytest
from pathlib import Path
from fastapi import HTTPException
from server.services.fs import create_file, create_folder, delete_path


def test_create_file(tmp_path: Path):
    target = tmp_path / "sub" / "file.txt"
    res = create_file(str(target))
    assert res["status"] == "ok"
    assert res["name"] == "file.txt"
    assert target.exists()

    # Should raise 400 if already exists
    with pytest.raises(HTTPException) as exc:
        create_file(str(target))
    assert exc.value.status_code == 400


def test_create_folder(tmp_path: Path):
    target = tmp_path / "new_folder"
    res = create_folder(str(target))
    assert res["status"] == "ok"
    assert res["name"] == "new_folder"
    assert target.is_dir()

    # Should raise 400 if already exists
    with pytest.raises(HTTPException) as exc:
        create_folder(str(target))
    assert exc.value.status_code == 400


def test_delete_path(tmp_path: Path):
    # Test delete file
    f = tmp_path / "to_delete.txt"
    f.touch()
    res = delete_path(str(f))
    assert res["status"] == "ok"
    assert not f.exists()

    # Test delete directory
    d = tmp_path / "dir_to_delete"
    d.mkdir()
    (d / "inner.txt").touch()
    res = delete_path(str(d))
    assert res["status"] == "ok"
    assert not d.exists()

    # Test delete nonexistent path -> 404
    with pytest.raises(HTTPException) as exc:
        delete_path(str(tmp_path / "nonexistent"))
    assert exc.value.status_code == 404

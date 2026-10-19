import json
from pathlib import Path
from unittest.mock import AsyncMock, patch
import pytest
from httpx import ASGITransport, AsyncClient

from server.server import app, health_check


@pytest.mark.asyncio
async def test_health_check_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/health")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert "gemini-3.8-flash" in data["model"]


@pytest.mark.asyncio
async def test_chat_controller():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("server.controllers.chat.invoke_chat") as mock_invoke:
            mock_invoke.return_value.response = "Calculated 42"
            mock_invoke.return_value.tool_calls = []
            res = await ac.post("/api/chat", json={"prompt": "test"})
            assert res.status_code == 200
            assert res.json()["response"] == "Calculated 42"

        async def fake_stream(*args, **kwargs):
            yield {"data": json.dumps({"type": "token", "content": "hi"})}
            yield {"data": json.dumps({"type": "done"})}

        with patch("server.controllers.chat.stream_chat", side_effect=fake_stream):
            res_stream = await ac.post("/api/chat/stream", json={"prompt": "test"})
            assert res_stream.status_code == 200
            assert "text/event-stream" in res_stream.headers["content-type"]


@pytest.mark.asyncio
async def test_fs_controller(tmp_path: Path):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create file
        f_path = str(tmp_path / "created.txt")
        res = await ac.post("/api/fs/create-file", json={"path": f_path})
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        # Create folder
        dir_path = str(tmp_path / "created_dir")
        res_dir = await ac.post("/api/fs/create-folder", json={"path": dir_path})
        assert res_dir.status_code == 200

        # Delete path
        res_del = await ac.post("/api/fs/delete", json={"path": f_path})
        assert res_del.status_code == 200


@pytest.mark.asyncio
async def test_project_controller(tmp_path: Path):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Init project
        res_init = await ac.post("/api/project/init", json={"path": str(tmp_path)})
        assert res_init.status_code == 200
        assert res_init.json()["created"] is True

        # Save cloud software
        sw_data = {
            "projectPath": str(tmp_path),
            "software": {
                "id": "forteweb",
                "name": "ForteWEB",
                "authenticated": True,
            }
        }
        res_save = await ac.post("/api/project/cloud-software/save", json=sw_data)
        assert res_save.status_code == 200
        assert res_save.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_forte_controller():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("server.controllers.forte.authenticate_forte", return_value={"access_token": "tok"}):
            res_auth = await ac.post("/api/cloud-software/forte/auth", json={"username": "u", "password": "p"})
            assert res_auth.status_code == 200
            assert res_auth.json()["access_token"] == "tok"

        with patch("server.controllers.forte.init_forte_project_file", return_value={"fileId": 123}):
            res_init = await ac.post("/api/cloud-software/forte/init-file", json={"projectPath": "/path"})
            assert res_init.status_code == 200
            assert res_init.json()["fileId"] == 123


@pytest.mark.asyncio
async def test_home_page_and_download_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Home page
        res_home = await ac.get("/")
        assert res_home.status_code == 200
        assert "Structural engineering AI that meets you where you work." in res_home.text
        assert "STATIKOR" in res_home.text

        # Favicon
        res_fav = await ac.get("/favicon.ico")
        assert res_fav.status_code == 200

        # Windows download redirect
        res_win = await ac.get("/download/windows", follow_redirects=False)
        assert res_win.status_code == 302
        assert "Statikor_0.1.0_x64-setup.exe" in res_win.headers["location"]

        # Mac download redirect
        res_mac = await ac.get("/download/mac", follow_redirects=False)
        assert res_mac.status_code == 302
        assert "Statikor_0.1.0_universal.dmg" in res_mac.headers["location"]

        # Dynamic download latest (Windows user agent)
        res_latest_win = await ac.get(
            "/download/latest",
            headers={"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            follow_redirects=False,
        )
        assert res_latest_win.status_code == 302
        assert "setup.exe" in res_latest_win.headers["location"]

        # Dynamic download latest (Mac user agent)
        res_latest_mac = await ac.get(
            "/download/latest",
            headers={"user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
            follow_redirects=False,
        )
        assert res_latest_mac.status_code == 302
        assert ".dmg" in res_latest_mac.headers["location"]

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
import httpx

from sidecar.sidecar import app, start

client = TestClient(app)

def test_health_check_cloud_online():
    mock_resp = MagicMock()
    mock_resp.status_code = 200

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_resp
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "statikor-sidecar"
        assert data["cloud_connection"] == "online"

def test_health_check_cloud_offline():
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.side_effect = Exception("Connection refused")
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["cloud_connection"] == "offline"

def test_proxy_api_standard():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "application/json"}
    
    async def aiter():
        yield b'{"result": "success"}'
    
    mock_resp.aiter_bytes = aiter

    with patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = mock_resp
        response = client.post("/api/projects", json={"name": "test"}, headers={"Authorization": "Bearer mock-token"})
        assert response.status_code == 200
        assert response.content == b'{"result": "success"}'
        
        # Verify headers were preserved
        sent_req = mock_send.call_args[0][0]
        assert sent_req.headers.get("authorization") == "Bearer mock-token"

def test_proxy_api_stream():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "text/event-stream"}
    mock_resp.aclose = AsyncMock()

    async def aiter():
        yield b"data: hello\n\n"
        yield b"data: world\n\n"

    mock_resp.aiter_bytes = aiter

    with patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
        mock_send.return_value = mock_resp
        response = client.get("/api/chat/stream", headers={"Authorization": "Bearer stream-token"})
        assert response.status_code == 200
        assert b"data: hello\n\n" in response.content

def test_start_function():
    with patch("uvicorn.run") as mock_run:
        start()
        mock_run.assert_called_once()

def test_sidecar_auth_session():
    state_id = "statikor_sidecar_test"
    resp = client.get(f"/api/auth/session/{state_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"

    # Store
    client.post(f"/api/auth/session/{state_id}", json={"accessToken": "sidecar_tok"})
    
    # Retrieve
    resp2 = client.get(f"/api/auth/session/{state_id}")
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "ok"
    assert resp2.json()["session"]["accessToken"] == "sidecar_tok"

def test_sidecar_auth_relay():
    # Store via relay
    client.post("/api/auth/relay", json={"accessToken": "relay_sidecar_tok"})
    
    # Retrieve via latest
    resp = client.get("/api/auth/session/latest")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
    assert resp.json()["session"]["accessToken"] == "relay_sidecar_tok"

def test_sidecar_websocket_rpc():
    with client.websocket_connect("/ws/rpc") as websocket:
        websocket.send_text('{"jsonrpc": "2.0", "method": "ping", "id": 1}')

def test_proxy_api_standard_connection_error():
    with patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
        mock_send.side_effect = httpx.ConnectError("All connection attempts failed")
        response = client.post("/api/projects", json={"name": "test"})
        assert response.status_code == 502
        assert "Unable to reach Statikor Agent Server" in response.json()["error"]

def test_proxy_api_stream_connection_error():
    with patch("httpx.AsyncClient.send", new_callable=AsyncMock) as mock_send:
        mock_send.side_effect = httpx.ConnectError("All connection attempts failed")
        response = client.post("/api/chat/stream", json={"messages": []})
        assert response.status_code == 200
        assert b"Unable to reach Statikor Agent Server" in response.content


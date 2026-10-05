"""Tests for browser-to-desktop auth session relay controller."""

import pytest
from fastapi.testclient import TestClient
from server.server import app

client = TestClient(app)


def test_auth_session_flow():
    state_id = "statikor_test_12345"

    # Initially pending
    resp = client.get(f"/api/auth/session/{state_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"

    # Store session
    session_data = {
        "accessToken": "tok_abc",
        "idToken": "id_xyz",
        "user": {"email": "engineer@firm.com", "name": "Firm Engineer"},
        "expiresIn": 3600,
    }
    resp_post = client.post(f"/api/auth/session/{state_id}", json=session_data)
    assert resp_post.status_code == 200
    assert resp_post.json()["status"] == "ok"

    # Retrieve session (one-time consume)
    resp_get = client.get(f"/api/auth/session/{state_id}")
    assert resp_get.status_code == 200
    data = resp_get.json()
    assert data["status"] == "ok"
    assert data["session"]["accessToken"] == "tok_abc"
    assert data["session"]["user"]["email"] == "engineer@firm.com"

    # Second retrieve is pending because consumed
    resp_second = client.get(f"/api/auth/session/{state_id}")
    assert resp_second.json()["status"] == "pending"


def test_auth_session_invalid_json():
    resp = client.post(
        "/api/auth/session/statikor_bad",
        content=b"not json",
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 400

"""Auth handoff controller for browser-to-desktop OAuth token relay."""

import time
from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Request

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In-memory store for pending desktop authentication sessions (state_id -> session_data)
# Sessions expire after 5 minutes (300 seconds)
_auth_sessions: Dict[str, Dict[str, Any]] = {}


def clean_expired_sessions():
    now = time.time()
    expired = [k for k, v in _auth_sessions.items() if v.get("created_at", 0) + 300 < now]
    for k in expired:
        _auth_sessions.pop(k, None)


@router.post("/session/{state_id}")
async def store_auth_session(state_id: str, request: Request):
    """Store tokens submitted by the browser after Auth0 redirect."""
    clean_expired_sessions()
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    data["created_at"] = time.time()
    _auth_sessions[state_id] = data
    return {"status": "ok", "state_id": state_id}


@router.get("/session/{state_id}")
async def get_auth_session(state_id: str):
    """Retrieve pending tokens for the given state_id (called by Tauri app)."""
    clean_expired_sessions()
    if state_id in _auth_sessions:
        data = _auth_sessions.pop(state_id)
        data.pop("created_at", None)
        return {"status": "ok", "session": data}
    return {"status": "pending"}

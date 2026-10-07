"""FastAPI Local Sidecar Service for Statikor Desktop.

Runs as a local background daemon on 127.0.0.1:41420, serving the Tauri frontend.
Proxies LLM and cloud operations to the remote Statikor Agent Server, while 
reserving local endpoints for CAD/BIM automation (Revit, ETABS, AutoCAD).
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import httpx
import uvicorn

env_local = Path(__file__).resolve().parents[2] / ".env.local"
if env_local.exists():
    load_dotenv(env_local)
else:
    load_dotenv()

REMOTE_SERVER_URL = os.getenv("STATIKOR_SERVER_URL", "http://127.0.0.1:8000")

app = FastAPI(
    title="Statikor Local Sidecar",
    description="Local daemon proxying to the cloud agent and exposing local tools.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",     
        "http://127.0.0.1:1420",
        "tauri://localhost",         
        "https://tauri.localhost",   
        "http://tauri.localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check that confirms sidecar is alive and pings remote server."""
    cloud_status = "offline"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{REMOTE_SERVER_URL}/health", timeout=2.0)
            if resp.status_code == 200:
                cloud_status = "online"
    except Exception:
        pass

    return {
        "status": "ok",
        "service": "statikor-sidecar",
        "cloud_connection": cloud_status,
        "remote_url": REMOTE_SERVER_URL
    }

# Local in-memory store for pending desktop OAuth sessions
_auth_sessions: dict[str, dict] = {}

@app.post("/api/auth/relay")
@app.post("/api/auth/session/{state_id}")
async def store_auth_session(request: Request, state_id: str = "latest"):
    """Store tokens submitted by browser after Auth0 Google login redirect."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    _auth_sessions[state_id] = data
    _auth_sessions["latest"] = data
    return {"status": "ok", "state_id": state_id}

@app.get("/api/auth/session/{state_id}")
async def get_auth_session(state_id: str = "latest"):
    """Retrieve pending tokens for the given state_id (called by Tauri app)."""
    if state_id in _auth_sessions:
        data = _auth_sessions.pop(state_id)
        return {"status": "ok", "session": data}
    return {"status": "pending"}

# Active local WebSocket RPC connections
_active_ws_clients: list[WebSocket] = []

@app.websocket("/ws/rpc")
async def websocket_rpc_endpoint(websocket: WebSocket):
    """Accept WebSocket RPC connections from the local Tauri desktop client."""
    await websocket.accept()
    _active_ws_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in _active_ws_clients:
            _active_ws_clients.remove(websocket)

# --- PROXY TO CLOUD AGENT ---
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def proxy_api(request: Request, path: str):
    """Proxy all /api/* requests to the remote cloud server."""
    client = httpx.AsyncClient(timeout=None)
    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None) # Remove local host header
    
    url = f"{REMOTE_SERVER_URL}/api/{path}"
    
    req = client.build_request(
        request.method, 
        url,
        content=body,
        headers=headers,
        params=request.query_params
    )

    # For Server-Sent Events (SSE) like the chat stream
    if request.url.path.endswith("/stream"):
        async def stream_response():
            try:
                response = await client.send(req, stream=True)
                async for chunk in response.aiter_bytes():
                    yield chunk
                await response.aclose()
            except Exception as exc:
                err_payload = json.dumps({
                    "type": "error",
                    "error": f"Unable to reach Statikor Agent Server at {REMOTE_SERVER_URL}: {exc}"
                })
                yield f"data: {err_payload}\n\n".encode("utf-8")
            finally:
                await client.aclose()
        return StreamingResponse(stream_response(), media_type="text/event-stream")
    else:
        # Standard API Proxy
        try:
            response = await client.send(req)
            await client.aclose()
            return StreamingResponse(
                response.aiter_bytes(),
                status_code=response.status_code,
                headers=dict(response.headers)
            )
        except Exception as exc:
            await client.aclose()
            return JSONResponse(
                status_code=502,
                content={"error": f"Unable to reach Statikor Agent Server at {REMOTE_SERVER_URL}: {exc}"}
            )

def start():
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=41420,
        log_level="info",
    )

if __name__ == "__main__":
    start()

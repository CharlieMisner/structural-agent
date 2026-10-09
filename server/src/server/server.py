"""FastAPI Sidecar Service for the Statikor Structural Engineering Agent.

Runs as a local background daemon on 127.0.0.1:8000, serving the LangGraph agent
and project tools to the Tauri desktop frontend.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Load environment variables (.env.local or .env)
env_local = Path(__file__).resolve().parents[2] / ".env.local"
if env_local.exists():
    load_dotenv(env_local)
else:
    load_dotenv()

from server.config.tools_config import tools_by_name
from server.controllers.auth import router as auth_router
from server.controllers.chat import router as chat_router
from server.controllers.forte import router as forte_router
from server.controllers.fs import router as fs_router
from server.controllers.project import router as project_router
from server.services.websocket_rpc import router as rpc_router

# ---------------------------------------------------------------------------
# FastAPI App & CORS Configuration
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Statikor Structural Agent API",
    description="Local sidecar API powering structural calculations and engineering reasoning",
    version="0.1.0",
)

# Allow requests from Tauri desktop app and local Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",     # Vite dev server
        "http://127.0.0.1:1420",
        "tauri://localhost",         # Tauri macOS/Linux webview
        "https://tauri.localhost",   # Tauri Windows webview
        "http://tauri.localhost",
        "https://statikor.com",
        "https://www.statikor.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Route Controllers
# ---------------------------------------------------------------------------
app.include_router(auth_router)
app.include_router(chat_router)
app.include_router(fs_router)
app.include_router(project_router)
app.include_router(forte_router)
app.include_router(rpc_router)


@app.get("/health")
async def health_check():
    """Health & readiness probe used by Tauri to confirm the sidecar is live."""
    api_key_set = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    return {
        "status": "ok",
        "service": "statikor-agent",
        "model": "gemini-3.8-flash",
        "api_key_configured": api_key_set,
        "available_tools": list(tools_by_name.keys()),
    }


def start():
    """Start the FastAPI sidecar server on 127.0.0.1:8000."""
    uvicorn.run(
        "server.server:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    start()

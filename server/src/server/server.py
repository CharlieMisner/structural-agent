"""FastAPI Sidecar Service for the Statikor Structural Engineering Agent.

Runs as a local background daemon on 127.0.0.1:8000, serving the LangGraph agent
and project tools to the Tauri desktop frontend.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
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
        "https://api.statikor.com",
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

# ---------------------------------------------------------------------------
# Static Web Assets & Home Page (statikor.com)
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).resolve().parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
async def serve_home_page():
    """Serve the Statikor home page matching desktop client dark HUD theme."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return {"status": "ok", "service": "statikor-server"}


@app.get("/favicon.ico", include_in_schema=False)
async def serve_favicon():
    """Serve favicon for web browsers."""
    fav_path = STATIC_DIR / "favicon.ico"
    if fav_path.exists():
        return FileResponse(fav_path)
    return {"error": "Not found"}


@app.get("/download/windows", include_in_schema=False)
async def download_windows():
    """Redirect to the latest Windows setup installer."""
    release_url = os.getenv(
        "STATIKOR_WINDOWS_DOWNLOAD_URL",
        "https://github.com/charliemisner/structural-agent/releases/latest/download/Statikor_0.1.0_x64-setup.exe",
    )
    return RedirectResponse(url=release_url, status_code=302)


@app.get("/download/mac", include_in_schema=False)
async def download_mac():
    """Redirect to the latest macOS DMG installer."""
    release_url = os.getenv(
        "STATIKOR_MAC_DOWNLOAD_URL",
        "https://github.com/charliemisner/structural-agent/releases/latest/download/Statikor_0.1.0_universal.dmg",
    )
    return RedirectResponse(url=release_url, status_code=302)


@app.get("/download/latest", include_in_schema=False)
async def download_latest(request: Request):
    """Detect OS from User-Agent and redirect to the appropriate installer."""
    user_agent = request.headers.get("user-agent", "").lower()
    if "mac" in user_agent:
        return await download_mac()
    return await download_windows()


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

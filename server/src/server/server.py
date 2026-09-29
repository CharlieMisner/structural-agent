"""FastAPI Sidecar Service for the Statikor Structural Engineering Agent.

Runs as a local background daemon on 127.0.0.1:41420, serving the LangGraph agent
to the Tauri desktop frontend.
"""

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain.messages import HumanMessage
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse
import uvicorn

from agent.graph import MessageState, graph

# Load environment variables (.env.local or .env)
env_local = Path(__file__).resolve().parents[2] / ".env.local"
if env_local.exists():
    load_dotenv(env_local)
else:
    load_dotenv()

from agent.config.tools_config import tools_by_name

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
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str = Field(..., description="The Role: user, assistant, etc.")
    content: str = Field(..., description="Content of the message.")
    
class ChatRequest(BaseModel):
    prompt: str = Field(..., description="The prompt sent to the agent.")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="Optional chat history."
    )
    
class ChatResponse(BaseModel):
    response: str = Field(..., description="The agents response.")
    tool_calls: list[dict[str, Any]] = Field(
        default_factory=list,
        description="List of tool calls executed during reasoning (e.g. beam calculations)"
    )

def extract_text(content: Any) -> str:
    """Extract string content whether content is a str or a list of blocks/dicts from Gemini."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts = []
        for part in content:
            if isinstance(part, str):
                texts.append(part)
            elif isinstance(part, dict) and "text" in part and isinstance(part["text"], str):
                texts.append(part["text"])
        return "".join(texts)
    return ""


class ProjectInitRequest(BaseModel):
    path: str = Field(..., description="Absolute path to the structural project directory")

class ProjectInitResponse(BaseModel):
    id: str = Field(..., description="Project UUID")
    created: bool = Field(..., description="True if a new .statikor/project.json was created")

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

@app.post("/api/project/init", response_model=ProjectInitResponse)
async def init_project(request: ProjectInitRequest):
    """Ensure .statikor/project.json exists in the opened project folder with a UUID."""
    proj_dir = Path(request.path)
    statikor_dir = proj_dir / ".statikor"
    project_file = statikor_dir / "project.json"

    if project_file.exists():
        try:
            with open(project_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "id" in data and isinstance(data["id"], str) and data["id"].strip():
                    return ProjectInitResponse(id=data["id"].strip(), created=False)
        except Exception:
            pass

    statikor_dir.mkdir(parents=True, exist_ok=True)
    import uuid
    project_id = str(uuid.uuid4())
    config = {"id": project_id}
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    return ProjectInitResponse(id=project_id, created=True)

class FsCreateRequest(BaseModel):
    path: str = Field(..., description="Absolute path of the file or folder to create")

@app.post("/api/fs/create-file")
async def api_create_file(request: FsCreateRequest):
    p = Path(request.path)
    if p.exists():
        raise HTTPException(status_code=400, detail="File or directory already exists")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.touch()
    return {"status": "ok", "path": str(p), "name": p.name}

@app.post("/api/fs/create-folder")
async def api_create_folder(request: FsCreateRequest):
    p = Path(request.path)
    if p.exists():
        raise HTTPException(status_code=400, detail="File or directory already exists")
    p.mkdir(parents=True, exist_ok=True)
    return {"status": "ok", "path": str(p), "name": p.name}

@app.post("/api/fs/delete")
async def api_delete_path(request: FsCreateRequest):
    p = Path(request.path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Path does not exist")
    if p.is_dir():
        import shutil
        shutil.rmtree(p)
    else:
        p.unlink()
    return {"status": "ok", "path": str(p)}
    
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    user_message = HumanMessage(content=request.prompt)
    initial_state: MessageState = {
        "messages": [user_message],
        "llm_calls": 0,
    }
    final_state = graph.invoke(initial_state)
    last_message = final_state["messages"][-1]
    response_text = extract_text(last_message.content)
    return ChatResponse(
        response=response_text,
        tool_calls=[]
    )


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """Server-Sent Events (SSE) endpoint streaming real-time tokens and tool events."""
    user_message = HumanMessage(content=request.prompt)
    initial_state: MessageState = {
        "messages": [user_message],
        "llm_calls": 0,
    }

    async def event_generator():
        async for event in graph.astream_events(initial_state, version="v2"):
            kind = event["event"]

            # 1. Text token generated by Gemini
            if kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if chunk and hasattr(chunk, "content"):
                    text = extract_text(chunk.content)
                    if text:
                        yield {
                            "data": json.dumps({
                                "type": "token",
                                "content": text,
                            })
                        }

            # 2. Calculation tool began
            elif kind == "on_tool_start":
                yield {
                    "data": json.dumps({
                        "type": "tool_start",
                        "tool": event.get("name", "unknown"),
                        "input": event["data"].get("input"),
                    })
                }

            # 3. Calculation tool finished
            elif kind == "on_tool_end":
                yield {
                    "data": json.dumps({
                        "type": "tool_end",
                        "tool": event.get("name", "unknown"),
                        "output": event["data"].get("output"),
                    })
                }

        # 4. Stream completion signal
        yield {"data": json.dumps({"type": "done"})}

    return EventSourceResponse(event_generator())


def start():
    """Start the FastAPI sidecar server on 127.0.0.1:41420."""
    uvicorn.run(
        "agent.server:app",
        host="127.0.0.1",
        port=41420,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    start()

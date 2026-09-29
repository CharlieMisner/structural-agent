# Statikor System Architecture & Networking

This document provides a technical specification of the inter-process communication, networking, and component responsibilities in Statikor.

---

## 1. Process Architecture

```text
┌────────────────────────────────────────────────────────┐
│             Desktop Application (Tauri v2)             │
│                                                        │
│  ┌───────────────────────┐   HTTP / SSE    ┌────────┐  │
│  │  Vite + React Webview │ ──────────────> │ Rust   │  │
│  │  (Port 1420 / Webview)│ <────────────── │ Core   │  │
│  └───────────────────────┘                 └────┬───┘  │
└─────────────────────────────────────────────────┼──────┘
                                                  │ Supervised
                                                  │ Subprocess
                                                  ▼
┌────────────────────────────────────────────────────────┐
│       Statikor Agent Daemon (FastAPI Sidecar)          │
│       Address: http://127.0.0.1:41420                  │
│                                                        │
│  ┌───────────────────────┐    Streaming    ┌────────┐  │
│  │  FastAPI Endpoints    │ <────────────── │ Lang-  │  │
│  │  (/health, /api/chat) │                 │ Graph  │  │
│  └───────────────────────┘                 └────┬───┘  │
│                                                 │      │
│                                                 ▼      │
│                                     Root Agent + Tools │
│                                     Driving Software   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Sidecar Supervision in Rust (`client/src-tauri/src/main.rs`)

Tauri acts as the parent supervisor for the Python agent:

1. **Discovery & Normalization**:
   - Searches `agent/.venv/bin/python` from candidate relative directories (`agent`, `../agent`, `../../agent`).
   - Normalizes paths using `normalize_path` without canonicalizing symlinks (preserving the Python virtual environment's `pyvenv.cfg`).
   - Injects `PYTHONPATH = agent/src`.
2. **Process Lifecycle**:
   - On app launch: Spawns `python -m agent.server` as a child process and logs its PID.
   - On exit (`RunEvent::Exit`): Safely kills the child process to avoid orphan uvicorn instances on port 41420.
3. **Environment Override**:
   - Setting `AGENT_PYTHON_PATH=/custom/python` bypasses discovery and runs the specified binary.

---

## 3. Communication Protocols

### 3.1. Health Check (`GET /health`)
- **URL**: `http://127.0.0.1:41420/health`
- **Response**:
  ```json
  {
    "status": "ok",
    "service": "statikor-agent",
    "model": "gemini-3.8-flash",
    "api_key_configured": true,
    "available_tools": ["max_moment_ss_beam"]
  }
  ```

### 3.2. Real-Time Chat Streaming (`POST /api/chat/stream`)
- **URL**: `http://127.0.0.1:41420/api/chat/stream`
- **Content-Type**: `application/json`
- **Body**: `{"prompt": "Query the base reactions for column C1 from the active ETABS model"}`
- **Response**: Server-Sent Events (`text/event-stream`)

#### Event Stream Schema
| Event Type | Payload Example | Purpose |
| :--- | :--- | :--- |
| `tool_start` | `{"type": "tool_start", "tool": "etabs_get_reactions", "input": {"column": "C1"}}` | Signals that a software tool has started |
| `tool_end` | `{"type": "tool_end", "tool": "etabs_get_reactions", "output": {"P": 245.5}}` | Reports the software tool result |
| `token` | `{"type": "token", "content": "According to the ETABS model..."}` | Incremental markdown/LaTeX text chunk |
| `done` | `{"type": "done"}` | Stream completed |
| `error` | `{"type": "error", "error": "Software connection error"}` | Stream error signal |

---

## 4. Frontend SSE Consumption (`client/src/services/agentApi.ts`)

- Uses native `fetch` with `ReadableStreamDefaultReader` and `TextDecoder`.
- Splits buffer by `\n` and extracts `data:` payloads.
- Invokes callbacks:
  - `onToolStart(toolName, input)`
  - `onToolEnd(toolName, output)`
  - `onToken(token)`
  - `onDone()`
  - `onError(error)`


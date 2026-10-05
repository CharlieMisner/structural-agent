import asyncio
import json
import uuid
from typing import Any, Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(prefix="/ws")

class WebSocketRPCManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.pending_requests: dict[str, asyncio.Future] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print("RPC Client connected")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print("RPC Client disconnected")

    async def execute_local_tool(self, tool_name: str, args: dict) -> Any:
        if not self.active_connections:
            raise RuntimeError("No active desktop client connected to execute local tool.")
            
        request_id = str(uuid.uuid4())
        future = asyncio.get_event_loop().create_future()
        self.pending_requests[request_id] = future
        
        payload = {
            "type": "execute_tool",
            "id": request_id,
            "tool": tool_name,
            "args": args
        }
        
        # Send to the first connected client (assumes 1 local client per sidecar)
        client_ws = self.active_connections[0]
        await client_ws.send_text(json.dumps(payload))
        
        # Wait for the client to return the result
        result = await future
        return result

    async def handle_client_message(self, text_data: str):
        try:
            data = json.loads(text_data)
            if data.get("type") == "tool_result":
                req_id = data.get("id")
                if req_id in self.pending_requests:
                    future = self.pending_requests.pop(req_id)
                    if not future.done():
                        # Support error strings or raw dict results
                        if "error" in data:
                            future.set_exception(Exception(data["error"]))
                        else:
                            future.set_result(data.get("result", {}))
        except Exception as e:
            print(f"Error handling RPC message: {e}")

rpc_manager = WebSocketRPCManager()

@router.websocket("/rpc")
async def websocket_rpc_endpoint(websocket: WebSocket):
    await rpc_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await rpc_manager.handle_client_message(data)
    except WebSocketDisconnect:
        rpc_manager.disconnect(websocket)

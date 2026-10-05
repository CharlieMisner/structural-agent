import asyncio
import json
from unittest.mock import AsyncMock, MagicMock
import pytest
from fastapi import WebSocketDisconnect

from server.services.websocket_rpc import WebSocketRPCManager, websocket_rpc_endpoint


@pytest.mark.asyncio
async def test_websocket_rpc_manager_flow():
    manager = WebSocketRPCManager()
    mock_ws = AsyncMock()

    # 1. Connect
    await manager.connect(mock_ws)
    assert len(manager.active_connections) == 1

    # 2. Execute local tool
    exec_task = asyncio.create_task(manager.execute_local_tool("etabs_get_reactions", {"col": "C1"}))

    # Give the task a moment to register future and send text
    await asyncio.sleep(0.01)
    assert mock_ws.send_text.called
    sent_payload = json.loads(mock_ws.send_text.call_args[0][0])
    req_id = sent_payload["id"]
    assert sent_payload["tool"] == "etabs_get_reactions"

    # 3. Simulate client returning result
    client_response = json.dumps({
        "type": "tool_result",
        "id": req_id,
        "result": {"P": 250.0},
    })
    await manager.handle_client_message(client_response)

    res = await exec_task
    assert res == {"P": 250.0}

    # 4. Disconnect
    manager.disconnect(mock_ws)
    assert len(manager.active_connections) == 0


@pytest.mark.asyncio
async def test_websocket_rpc_manager_error_handling():
    manager = WebSocketRPCManager()
    mock_ws = AsyncMock()
    await manager.connect(mock_ws)

    exec_task = asyncio.create_task(manager.execute_local_tool("unknown_tool", {}))
    await asyncio.sleep(0.01)

    sent_payload = json.loads(mock_ws.send_text.call_args[0][0])
    req_id = sent_payload["id"]

    # Simulate client error message
    err_msg = json.dumps({
        "type": "tool_result",
        "id": req_id,
        "error": "Failed to drive software",
    })
    await manager.handle_client_message(err_msg)

    with pytest.raises(Exception) as exc:
        await exec_task
    assert "Failed to drive software" in str(exc.value)


@pytest.mark.asyncio
async def test_websocket_rpc_no_clients():
    manager = WebSocketRPCManager()
    with pytest.raises(RuntimeError) as exc:
        await manager.execute_local_tool("test", {})
    assert "No active desktop client" in str(exc.value)


@pytest.mark.asyncio
async def test_websocket_rpc_endpoint():
    mock_ws = AsyncMock()
    # First receive returns a message, second raises WebSocketDisconnect
    mock_ws.receive_text.side_effect = [
        json.dumps({"type": "ping"}),
        WebSocketDisconnect(),
    ]

    await websocket_rpc_endpoint(mock_ws)
    assert mock_ws.accept.called

import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from langchain_core.messages import AIMessage, HumanMessage

from server.dtos.chat import ChatRequest
from server.services.chat import extract_text, invoke_chat, stream_chat


def test_extract_text():
    assert extract_text("plain string") == "plain string"
    assert extract_text([{"type": "text", "text": "chunk1"}, {"type": "text", "text": "chunk2"}]) == "chunk1chunk2"
    assert extract_text(["string1", "string2"]) == "string1string2"
    assert extract_text(123) == "123"


def test_invoke_chat():
    fake_state = {
        "messages": [AIMessage(content="Beam calculation result: 50 kNm")]
    }
    with patch("server.services.chat.graph.invoke", return_value=fake_state):
        req = ChatRequest(prompt="calculate")
        res = invoke_chat(req)
        assert res.response == "Beam calculation result: 50 kNm"


@pytest.mark.asyncio
async def test_stream_chat():
    events = [
        {
            "event": "on_chat_model_stream",
            "data": {"chunk": AIMessage(content="Thinking...")},
        },
        {
            "event": "on_tool_start",
            "name": "max_moment_ss_beam",
            "data": {"input": {"w": 2.0, "l": 10.0}},
        },
        {
            "event": "on_tool_end",
            "name": "max_moment_ss_beam",
            "data": {"output": 25.0},
        },
    ]

    async def fake_astream_events(*args, **kwargs):
        for e in events:
            yield e

    with patch("server.services.chat.graph.astream_events", side_effect=fake_astream_events):
        req = ChatRequest(prompt="calculate")
        chunks = []
        async for chunk in stream_chat(req):
            data = json.loads(chunk["data"])
            chunks.append(data)

        assert len(chunks) == 4
        assert chunks[0]["type"] == "token"
        assert chunks[0]["content"] == "Thinking..."
        assert chunks[1]["type"] == "tool_start"
        assert chunks[1]["tool"] == "max_moment_ss_beam"
        assert chunks[2]["type"] == "tool_end"
        assert chunks[2]["tool"] == "max_moment_ss_beam"
        assert chunks[3]["type"] == "done"


@pytest.mark.asyncio
async def test_stream_chat_error():
    async def broken_astream_events(*args, **kwargs):
        raise RuntimeError("500 INTERNAL")
        yield  # pragma: no cover

    with patch("server.services.chat.graph.astream_events", side_effect=broken_astream_events):
        req = ChatRequest(prompt="calculate")
        chunks = [json.loads(c["data"]) async for c in stream_chat(req)]
        assert chunks[0]["type"] == "error"
        assert "500 INTERNAL" in chunks[0]["error"]
        assert chunks[1]["type"] == "done"

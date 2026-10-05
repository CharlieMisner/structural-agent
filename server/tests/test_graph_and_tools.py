import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from server.graph import llm_call, tool_node, should_continue, END, TOOL_NODE
from server.tools.forte_tools import add_forte_floor_joist
from server.config.tools_config import tools, tools_by_name, max_moment_ss_beam


def test_max_moment_ss_beam():
    # w=2, l=10 -> M = (2 * 100) / 8 = 25
    assert max_moment_ss_beam.invoke({"w": 2.0, "l": 10.0}) == 25.0


def test_add_forte_floor_joist_tool():
    with patch("server.tools.forte_tools.add_forte_floor_joist_to_project", return_value={"status": "success"}):
        res = add_forte_floor_joist.invoke({"member_name": "TestJoist", "span": 20.0})
        assert res == {"status": "success"}


def test_tools_config():
    assert "max_moment_ss_beam" in tools_by_name
    assert "add_forte_floor_joist" in tools_by_name
    assert len(tools) >= 2


def test_should_continue():
    msg_with_tools = AIMessage(
        content="calling tool",
        tool_calls=[{"name": "max_moment_ss_beam", "args": {"w": 1, "l": 1}, "id": "call_1"}]
    )
    assert should_continue({"messages": [msg_with_tools], "llm_calls": 1}) == TOOL_NODE

    msg_without_tools = AIMessage(content="final answer")
    assert should_continue({"messages": [msg_without_tools], "llm_calls": 1}) == END


def test_llm_call():
    mock_ai_msg = AIMessage(content="Calculated result")
    mock_model = MagicMock()
    mock_model.invoke.return_value = mock_ai_msg
    with patch("server.graph.model_with_tools", mock_model):
        state = {"messages": [HumanMessage(content="test")], "llm_calls": 0}
        res = llm_call(state)
        assert res["llm_calls"] == 1
        assert res["messages"][0].content == "Calculated result"



@pytest.mark.asyncio
async def test_tool_node_success():
    tool_call = {
        "name": "max_moment_ss_beam",
        "args": {"w": 2.0, "l": 10.0},
        "id": "call_abc",
    }
    ai_msg = AIMessage(content="", tool_calls=[tool_call])
    state = {"messages": [ai_msg], "llm_calls": 1}

    res = await tool_node(state)
    assert len(res["messages"]) == 1
    assert res["messages"][0].content == "25.0"
    assert res["messages"][0].tool_call_id == "call_abc"


@pytest.mark.asyncio
async def test_tool_node_error_handling():
    tool_call = {
        "name": "add_forte_floor_joist",
        "args": {},
        "id": "call_err",
    }
    ai_msg = AIMessage(content="", tool_calls=[tool_call])
    state = {"messages": [ai_msg], "llm_calls": 1}

    with patch.dict(tools_by_name, {"add_forte_floor_joist": AsyncMock(ainvoke=AsyncMock(side_effect=Exception("API failure")))}):
        res = await tool_node(state)
        assert "Error executing tool: API failure" in res["messages"][0].content


@pytest.mark.asyncio
async def test_tool_node_invalid_state():
    state = {"messages": [HumanMessage(content="No tool calls")], "llm_calls": 1}
    with pytest.raises(ValueError):
        await tool_node(state)

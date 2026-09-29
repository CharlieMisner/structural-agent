import operator
import os
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain.chat_models import init_chat_model
from langchain.messages import AIMessage, AnyMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from agent.config.tools_config import tools, tools_by_name

from pathlib import Path

env_local = Path(__file__).resolve().parents[2] / ".env.local"
if env_local.exists():
    load_dotenv(env_local)
else:
    load_dotenv()

LLM_CALL = "llm_call"
TOOL_NODE = "tool_node"

system_message = SystemMessage(
    content=(
        "You are Statikor, an intelligent assistant designed to meet structural engineers where they already work. "
        "Your core purpose is to drive, automate, and orchestrate existing professional structural engineering "
        "software (including Autodesk Revit, ETABS, SAP2000, Enercalc, Forte, spColumn, RISA, RAM Steel, and Excel). "
        "Always prioritize utilizing integrated engineering software and tools for calculations, analyses, "
        "and code verification."
    )
)

api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "placeholder-key"

model = init_chat_model(
    "gemini-3.8-flash",
    model_provider="google_genai",
    api_key=api_key,
    temperature=0
)

model_with_tools = model.bind_tools(tools)

class MessageState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]
    llm_calls: int

def llm_call(state: MessageState):
    return {
        "messages": [model_with_tools.invoke(
            [system_message] + state["messages"]
        )],
        "llm_calls": state.get("llm_calls", 0) + 1
    }

def tool_node(state: MessageState):
    result = []
    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        raise ValueError(
            f"tool_node expected an AIMessage with tool_calls, but received {type(last_message).__name__}"
        )

    for tool_call in last_message.tool_calls:
        tool = tools_by_name[tool_call["name"]]
        observation = tool.invoke(tool_call["args"])
        result.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
    return {"messages": result}

def should_continue(state: MessageState) -> str:
    messages = state["messages"]
    last_message: AnyMessage = messages[-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        return TOOL_NODE

    return END

agent_builder = StateGraph(MessageState)

agent_builder.add_node(TOOL_NODE, tool_node)
agent_builder.add_node(LLM_CALL, llm_call)

agent_builder.add_edge(START, LLM_CALL)
agent_builder.add_conditional_edges(
    LLM_CALL,
    should_continue,
    [TOOL_NODE, END]
)
agent_builder.add_edge(TOOL_NODE, LLM_CALL)

graph = agent_builder.compile()
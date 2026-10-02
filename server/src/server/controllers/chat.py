from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from server.dtos.chat import ChatRequest, ChatResponse
from server.services.chat import invoke_chat, stream_chat

router = APIRouter(prefix="/api/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Synchronous chat endpoint executing the LangGraph agent."""
    return invoke_chat(request)


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """Server-Sent Events (SSE) endpoint streaming real-time tokens and tool events."""
    return EventSourceResponse(stream_chat(request))


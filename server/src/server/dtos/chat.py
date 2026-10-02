from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Text content of the message")


class ChatRequest(BaseModel):
    prompt: str = Field(..., description="User query / prompt for the structural agent")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="Prior conversation turns for multi-turn context",
    )


class ChatResponse(BaseModel):
    response: str
    tool_calls: list[dict] = Field(default_factory=list)


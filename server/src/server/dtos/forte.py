from pydantic import BaseModel


class ForteAuthRequest(BaseModel):
    username: str
    password: str


class ForteInitFileRequest(BaseModel):
    projectPath: str
    token: str | None = None
    username: str | None = None

from pydantic import BaseModel, Field


class FsCreateRequest(BaseModel):
    path: str = Field(..., description="Absolute path of the file or folder to create")

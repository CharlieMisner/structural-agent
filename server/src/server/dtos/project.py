from pydantic import AliasChoices, BaseModel, Field


class ProjectInitRequest(BaseModel):
    path: str = Field(..., description="Absolute path of the opened project directory")


class ProjectInitResponse(BaseModel):
    id: str
    created: bool


class CloudSoftwareConfigModel(BaseModel):
    id: str
    name: str
    authenticated: bool = False
    username: str | None = None
    tokenExpiresAt: int | None = None
    addedAt: int | None = None
    forteUserRootId: int | None = None
    fileId: int | None = None
    projectFileTreeId: int | None = None


# Alias for backward compatibility
ToolConfigModel = CloudSoftwareConfigModel


class SaveProjectCloudSoftwareRequest(BaseModel):
    projectPath: str
    software: CloudSoftwareConfigModel = Field(
        ...,
        validation_alias=AliasChoices("software", "tool"),
        description="Cloud software configuration metadata",
    )


# Alias for backward compatibility
SaveProjectToolRequest = SaveProjectCloudSoftwareRequest

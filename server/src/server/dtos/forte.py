from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field

class ForteAuthRequest(BaseModel):
    username: str
    password: str

class ForteInitFileRequest(BaseModel):
    projectPath: str
    token: Optional[str] = None
    username: Optional[str] = None

class ForteBaseModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

class ForteMember(ForteBaseModel):
    MemberID: int
    IDTag: int
    MemberName: str
    MemberType: int
    MemberTypeStringTag: str
    StructuralSystem: int
    StructuralSystemStringTag: str
    IsDesignable: bool
    MemberLength: float
    Depth: float
    Spacing: float
    Plies: int

class ForteMemberContainer(ForteBaseModel):
    ContainerID: int
    LevelSettingsData: dict[str, Any]
    Members: list[ForteMember]

class ForteMemberManagerData(ForteBaseModel):
    SelectedContainerID: int
    SelectedMemberID: int
    MemberContainers: list[ForteMemberContainer]

class ForteProjectManagerData(ForteBaseModel):
    ProjectFileTreeID: int
    ProjectName: str

class ForteApplicationData(ForteBaseModel):
    DataVersion: str
    BuildNumber: int
    MemberManagerData: ForteMemberManagerData
    ProjectManagerData: ForteProjectManagerData

class ForteSolution(ForteBaseModel):
    ProductLabel: str
    ProductID: int
    ProductPasses: bool
    IsSelected: bool
    IsSuggested: bool
    Depth: float
    Plies: int
    Spacing: float
    Series: str

class ForteSolutionsData(ForteBaseModel):
    SolutionList: list[ForteSolution]
    DesignResultsProductLabel: Optional[str] = None
    DesignResultsProductPasses: Optional[bool] = None

class ForteMemberData(ForteBaseModel):
    MemberIDTag: int
    DataVersion: str
    BuildNumber: int
    SolutionsData: Optional[ForteSolutionsData] = None

class FortePostResponseData(ForteBaseModel):
    IsPostResponseDataObject: int = 1
    FileHash: str = ""
    ApplicationData: ForteApplicationData
    MemberData: ForteMemberData

class FortePayload(ForteBaseModel):
    postResponseData: FortePostResponseData


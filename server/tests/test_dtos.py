import pytest
from server.dtos.chat import ChatMessage, ChatRequest, ChatResponse
from server.dtos.fs import FsCreateRequest
from server.dtos.project import (
    ProjectInitRequest,
    ProjectInitResponse,
    CloudSoftwareConfigModel,
    ToolConfigModel,
    SaveProjectCloudSoftwareRequest,
    SaveProjectToolRequest,
)
from server.dtos.forte import (
    ForteAuthRequest,
    ForteInitFileRequest,
    ForteMember,
    ForteMemberContainer,
    ForteMemberManagerData,
    ForteProjectManagerData,
    ForteApplicationData,
    ForteSolution,
    ForteSolutionsData,
    ForteMemberData,
    FortePostResponseData,
    FortePayload,
)


def test_chat_dtos():
    msg = ChatMessage(role="user", content="Hello")
    assert msg.role == "user"
    assert msg.content == "Hello"

    req = ChatRequest(prompt="Calculate beam", history=[msg])
    assert req.prompt == "Calculate beam"
    assert len(req.history) == 1

    res = ChatResponse(response="Done", tool_calls=[{"name": "tool_1"}])
    assert res.response == "Done"
    assert len(res.tool_calls) == 1


def test_fs_dtos():
    req = FsCreateRequest(path="/tmp/test.txt")
    assert req.path == "/tmp/test.txt"


def test_project_dtos():
    init_req = ProjectInitRequest(path="/projects/my_project")
    assert init_req.path == "/projects/my_project"

    init_res = ProjectInitResponse(id="p123", created=True)
    assert init_res.id == "p123"
    assert init_res.created is True

    cfg = CloudSoftwareConfigModel(
        id="forteweb",
        name="ForteWEB",
        authenticated=True,
        username="user@example.com",
        tokenExpiresAt=123456789,
        addedAt=123456780,
        forteUserRootId=10,
        fileId=20,
        projectFileTreeId=30,
    )
    assert cfg.id == "forteweb"
    assert cfg.authenticated is True

    # Test alias tool / software
    save_req_tool = SaveProjectCloudSoftwareRequest.model_validate({
        "projectPath": "/path/to/proj",
        "tool": cfg.model_dump(),
    })
    assert save_req_tool.software.id == "forteweb"

    save_req_sw = SaveProjectCloudSoftwareRequest(
        projectPath="/path/to/proj",
        software=cfg,
    )
    assert save_req_sw.projectPath == "/path/to/proj"


def test_forte_dtos():
    auth_req = ForteAuthRequest(username="user", password="pwd")
    assert auth_req.username == "user"

    init_req = ForteInitFileRequest(projectPath="/path", token="tok", username="usr")
    assert init_req.token == "tok"

    member = ForteMember(
        MemberID=1,
        IDTag=101,
        MemberName="Joist 1",
        MemberType=1,
        MemberTypeStringTag="FloorJoist",
        StructuralSystem=1,
        StructuralSystemStringTag="System1",
        IsDesignable=True,
        MemberLength=144.0,
        Depth=9.5,
        Spacing=16.0,
        Plies=1,
    )
    assert member.MemberName == "Joist 1"

    container = ForteMemberContainer(
        ContainerID=0,
        LevelSettingsData={"level": 1},
        Members=[member],
    )
    assert len(container.Members) == 1

    mm_data = ForteMemberManagerData(
        SelectedContainerID=0,
        SelectedMemberID=1,
        MemberContainers=[container],
    )
    pm_data = ForteProjectManagerData(
        ProjectFileTreeID=500,
        ProjectName="Test Project",
    )
    app_data = ForteApplicationData(
        DataVersion="1.0",
        BuildNumber=100,
        MemberManagerData=mm_data,
        ProjectManagerData=pm_data,
    )

    sol = ForteSolution(
        ProductLabel="TJ 110",
        ProductID=12,
        ProductPasses=True,
        IsSelected=True,
        IsSuggested=True,
        Depth=9.5,
        Plies=1,
        Spacing=16.0,
        Series="TJI",
    )
    sols_data = ForteSolutionsData(
        SolutionList=[sol],
        DesignResultsProductLabel="TJ 110",
        DesignResultsProductPasses=True,
    )
    member_data = ForteMemberData(
        MemberIDTag=101,
        DataVersion="1.0",
        BuildNumber=100,
        SolutionsData=sols_data,
    )

    prd = FortePostResponseData(
        IsPostResponseDataObject=1,
        FileHash="hash123",
        ApplicationData=app_data,
        MemberData=member_data,
    )
    assert prd.FileHash == "hash123"

    payload = FortePayload(postResponseData=prd)
    dump = payload.model_dump(exclude_none=True)
    assert "postResponseData" in dump
    assert dump["postResponseData"]["FileHash"] == "hash123"

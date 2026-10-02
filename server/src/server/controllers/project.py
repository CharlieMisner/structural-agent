from fastapi import APIRouter

from server.dtos.project import (
    ProjectInitRequest,
    ProjectInitResponse,
    SaveProjectCloudSoftwareRequest,
)
from server.services.project import (
    init_project,
    save_project_cloud_software,
)

router = APIRouter(tags=["Project"])


@router.post("/api/project/init", response_model=ProjectInitResponse)
async def init_project_api(request: ProjectInitRequest):
    return init_project(request.path)


@router.post("/api/project/cloud-software/save")
async def save_project_cloud_software_api(request: SaveProjectCloudSoftwareRequest):
    return save_project_cloud_software(request.projectPath, request.software)

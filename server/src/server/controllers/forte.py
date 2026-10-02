from fastapi import APIRouter

from server.dtos.forte import ForteAuthRequest, ForteInitFileRequest
from server.services.forte import authenticate_forte, init_forte_project_file

router = APIRouter(prefix="/api/cloud-software/forte", tags=["Forte"])


@router.post("/auth")
async def forte_auth_api(request: ForteAuthRequest):
    return authenticate_forte(request.username, request.password)


@router.post("/init-file")
async def forte_init_file_api(request: ForteInitFileRequest):
    return init_forte_project_file(
        project_path=request.projectPath,
        token=request.token,
        username=request.username,
    )

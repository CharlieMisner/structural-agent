from fastapi import APIRouter

from server.dtos.fs import FsCreateRequest
from server.services.fs import create_file, create_folder, delete_path

router = APIRouter(prefix="/api/fs", tags=["FileSystem"])


@router.post("/create-file")
async def api_create_file(request: FsCreateRequest):
    return create_file(request.path)


@router.post("/create-folder")
async def api_create_folder(request: FsCreateRequest):
    return create_folder(request.path)


@router.post("/delete")
async def api_delete_path(request: FsCreateRequest):
    return delete_path(request.path)

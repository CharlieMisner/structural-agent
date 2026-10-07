from typing import Optional
from fastapi import APIRouter, Depends

from server.auth.auth0 import User, get_optional_current_user
from server.dtos.fs import FsCreateRequest
from server.services.fs import create_file, create_folder, delete_path

router = APIRouter(prefix="/api/fs", tags=["FileSystem"])


@router.post("/create-file")
async def api_create_file(
    request: FsCreateRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    return create_file(request.path)


@router.post("/create-folder")
async def api_create_folder(
    request: FsCreateRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    return create_folder(request.path)


@router.post("/delete")
async def api_delete_path(
    request: FsCreateRequest,
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    return delete_path(request.path)

from pathlib import Path
import shutil

from fastapi import HTTPException


def create_file(path_str: str) -> dict[str, str]:
    p = Path(path_str)
    if p.exists():
        raise HTTPException(status_code=400, detail="File or directory already exists")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.touch()
    return {"status": "ok", "path": str(p), "name": p.name}


def create_folder(path_str: str) -> dict[str, str]:
    p = Path(path_str)
    if p.exists():
        raise HTTPException(status_code=400, detail="File or directory already exists")
    p.mkdir(parents=True, exist_ok=True)
    return {"status": "ok", "path": str(p), "name": p.name}


def delete_path(path_str: str) -> dict[str, str]:
    p = Path(path_str)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Path does not exist")
    if p.is_dir():
        shutil.rmtree(p)
    else:
        p.unlink()
    return {"status": "ok", "path": str(p)}

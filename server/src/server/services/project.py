import json
from pathlib import Path
from typing import Any
import uuid

ACTIVE_PROJECT_PATH = None

from server.dtos.project import CloudSoftwareConfigModel, ProjectInitResponse


def init_project(path_str: str) -> ProjectInitResponse:
    global ACTIVE_PROJECT_PATH
    ACTIVE_PROJECT_PATH = path_str
    """Ensure .statikor/project.json exists in the opened project folder with a UUID."""
    proj_dir = Path(path_str)
    statikor_dir = proj_dir / ".statikor"
    project_file = statikor_dir / "project.json"

    if project_file.exists():
        try:
            with open(project_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "id" in data and isinstance(data["id"], str) and data["id"].strip():
                    return ProjectInitResponse(id=data["id"].strip(), created=False)
        except Exception:
            pass

    statikor_dir.mkdir(parents=True, exist_ok=True)
    project_id = str(uuid.uuid4())
    config = {"id": project_id, "cloud-software": []}
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    return ProjectInitResponse(id=project_id, created=True)


def save_project_cloud_software(project_path: str, software: CloudSoftwareConfigModel) -> dict[str, Any]:
    global ACTIVE_PROJECT_PATH
    ACTIVE_PROJECT_PATH = project_path
    """Save or update cloud software metadata in .statikor/project.json."""
    proj_dir = Path(project_path)
    statikor_dir = proj_dir / ".statikor"
    statikor_dir.mkdir(parents=True, exist_ok=True)
    project_file = statikor_dir / "project.json"

    data: dict[str, Any] = {"id": str(proj_dir.name), "cloud-software": []}
    if project_file.exists():
        try:
            with open(project_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass

    # Read from cloud-software (or legacy keys)
    software_list = data.get("cloud-software")
    if software_list is None:
        software_list = data.get("cloudSoftware")
    if software_list is None:
        software_list = data.get("tools")
    if not isinstance(software_list, list):
        software_list = []

    software_dict = software.model_dump(exclude_none=True)
    updated = False
    for i, s in enumerate(software_list):
        if isinstance(s, dict) and s.get("id") == software.id:
            software_list[i] = software_dict
            updated = True
            break
    if not updated:
        software_list.append(software_dict)

    data["cloud-software"] = software_list
    data.pop("tools", None)
    data.pop("cloudSoftware", None)

    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    return {"status": "ok", "config": data}


# Backward-compatible alias
save_project_tool = save_project_cloud_software

from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException


def authenticate_forte(username: str, password: str) -> dict[str, Any]:
    """Authenticate with ForteWEB OAuth production endpoint."""
    enc_user = quote(username, safe="@.-_~")
    enc_pass = quote(password, safe="")
    body = f"grant_type=password&username={enc_user}&password={enc_pass}"
    cmd = [
        "curl", "-s",
        "--url", "https://fortewebapi-production.azurewebsites.net/token",
        "-H", "accept: application/json, text/plain, */*",
        "-H", "accept-language: en-US",
        "-H", "cache-control: no-cache",
        "-H", "content-type: text/plain",
        "-H", "origin: https://forteweb.com",
        "-H", "pragma: no-cache",
        "-H", "priority: u=1, i",
        "-H", "referer: https://forteweb.com/",
        "-H", 'sec-ch-ua: "Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
        "-H", "sec-ch-ua-mobile: ?0",
        "-H", 'sec-ch-ua-platform: "macOS"',
        "-H", "sec-fetch-dest: empty",
        "-H", "sec-fetch-mode: cors",
        "-H", "sec-fetch-site: cross-site",
        "-H", "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
        "--data-raw", body,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        out = proc.stdout
        try:
            data = json.loads(out)
            if "access_token" in data:
                tok = data["access_token"]
                exp = data.get("expires_in", 86400)
                tt = data.get("token_type", "bearer")
                un = data.get("userName") or data.get("username") or username
                return {
                    "access_token": tok,
                    "accessToken": tok,
                    "expires_in": exp,
                    "expiresIn": exp,
                    "token_type": tt,
                    "tokenType": tt,
                    "username": un,
                    "userName": un,
                }
            if "error_description" in data:
                raise HTTPException(status_code=401, detail=data["error_description"])
            if "error" in data:
                raise HTTPException(status_code=401, detail=data["error"])
        except json.JSONDecodeError:
            pass
        raise HTTPException(status_code=400, detail=f"Authentication rejected: {out}")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


def init_forte_project_file(
    project_path: str,
    token: str | None = None,
    username: str | None = None,
) -> dict[str, Any]:
    """If project doesn't have a Forte file ID, query GetAllFileSystemData, find Root, and run AddNewFile."""
    proj_dir = Path(project_path)
    statikor_dir = proj_dir / ".statikor"
    project_file = statikor_dir / "project.json"

    # 1. Read existing config
    data: dict[str, Any] = {"id": str(proj_dir.name), "cloud-software": []}
    if project_file.exists():
        try:
            with open(project_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            pass

    software_list = data.get("cloud-software")
    if software_list is None:
        software_list = data.get("cloudSoftware")
    if software_list is None:
        software_list = data.get("tools")
    if not isinstance(software_list, list):
        software_list = []

    forte_software: dict[str, Any] | None = None
    for s in software_list:
        if isinstance(s, dict) and s.get("id") == "forteweb":
            forte_software = s
            break

    # If already has fileId, return existing immediately
    if forte_software and (forte_software.get("fileId") or forte_software.get("projectFileTreeId")):
        return forte_software

    # 2. Retrieve token if not provided
    if not token:
        cred_file = Path.home() / ".statikor" / "credentials.json"
        if cred_file.exists():
            try:
                with open(cred_file, "r", encoding="utf-8") as f:
                    creds = json.load(f)
                    user_key = f"com.statikor.forteweb:{username or (forte_software and forte_software.get('username'))}"
                    token = creds.get(user_key)
                    if not token:
                        for k, v in creds.items():
                            if k.startswith("com.statikor.forteweb:") and isinstance(v, str):
                                token = v
                                break
            except Exception:
                pass

    if not token:
        raise HTTPException(status_code=401, detail="Forte authentication token not found. Please sign in.")

    # 3. Request GetAllFileSystemData
    cmd_fs = [
        "curl", "-s",
        "--url", "https://fortewebapi-production.azurewebsites.net/api/FileSystem/GetAllFileSystemData",
        "-H", "accept: application/json, text/plain, */*",
        "-H", "accept-language: en-US",
        "-H", f"authorization: Bearer {token}",
        "-H", "cache-control: no-cache",
        "-H", "content-type: application/json",
        "-H", "origin: https://forteweb.com",
        "-H", "pragma: no-cache",
        "-H", "priority: u=1, i",
        "-H", "referer: https://forteweb.com/",
        "-H", 'sec-ch-ua: "Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
        "-H", "sec-ch-ua-mobile: ?0",
        "-H", 'sec-ch-ua-platform: "macOS"',
        "-H", "sec-fetch-dest: empty",
        "-H", "sec-fetch-mode: cors",
        "-H", "sec-fetch-site: cross-site",
        "-H", "sec-fetch-storage-access: active",
        "-H", "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
        "--data-raw", '{"lastAccessedDate":null}',
    ]
    proc_fs = subprocess.run(cmd_fs, capture_output=True, text=True, check=False)
    try:
        fs_data = json.loads(proc_fs.stdout)
    except Exception:
        raise HTTPException(status_code=500, detail=f"Failed to parse GetAllFileSystemData response: {proc_fs.stdout}")

    # Search for the item with text:"Root"
    forte_user_root_id: int | None = None
    all_tree_items = fs_data.get("allTreeItems", [])
    if isinstance(all_tree_items, list):
        for item in all_tree_items:
            if isinstance(item, dict) and (item.get("text") == "Root" or item.get("Text") == "Root"):
                val = item.get("id")
                if isinstance(val, int):
                    forte_user_root_id = val
                    break

    if forte_user_root_id is None:
        tree_roots = fs_data.get("treeRoots", [])
        if isinstance(tree_roots, list) and len(tree_roots) > 0 and isinstance(tree_roots[0], dict):
            val = tree_roots[0].get("RootTreeItemID")
            if isinstance(val, int):
                forte_user_root_id = val

    if forte_user_root_id is None:
        raise HTTPException(status_code=500, detail="Could not find Root folder (forteUserRootId) in Forte file system")

    # 4. Request AddNewFile with fileName matching project folder name
    file_name = proj_dir.name or "Statikor Project"
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    add_payload = json.dumps({
        "parentFolderId": forte_user_root_id,
        "fileName": file_name,
        "receivedDataDate": now_iso,
        "previousFileIdToClose": None,
    })

    cmd_add = [
        "curl", "-s",
        "--url", "https://fortewebapi-production.azurewebsites.net/api/FileSystem/AddNewFile",
        "-H", "accept: application/json, text/plain, */*",
        "-H", "accept-language: en-US",
        "-H", f"authorization: Bearer {token}",
        "-H", "cache-control: no-cache",
        "-H", "content-type: application/json",
        "-H", "origin: https://forteweb.com",
        "-H", "pragma: no-cache",
        "-H", "priority: u=1, i",
        "-H", "referer: https://forteweb.com/",
        "-H", 'sec-ch-ua: "Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
        "-H", "sec-ch-ua-mobile: ?0",
        "-H", 'sec-ch-ua-platform: "macOS"',
        "-H", "sec-fetch-dest: empty",
        "-H", "sec-fetch-mode: cors",
        "-H", "sec-fetch-site: cross-site",
        "-H", "sec-fetch-storage-access: active",
        "-H", "user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
        "--data-raw", add_payload,
    ]
    proc_add = subprocess.run(cmd_add, capture_output=True, text=True, check=False)
    try:
        add_data = json.loads(proc_add.stdout)
    except Exception:
        raise HTTPException(status_code=500, detail=f"Failed to parse AddNewFile response: {proc_add.stdout}")

    # Extract ProjectFileTreeID from postResponseData.ApplicationData.ProjectManagerData.ProjectFileTreeID
    project_file_tree_id: int | None = None
    try:
        val = (
            add_data.get("postResponseData", {})
            .get("ApplicationData", {})
            .get("ProjectManagerData", {})
            .get("ProjectFileTreeID")
        )
        if isinstance(val, int):
            project_file_tree_id = val
    except Exception:
        pass

    if project_file_tree_id is None:
        m = re.search(r'"ProjectFileTreeID"\s*:\s*(\d+)', proc_add.stdout)
        if m:
            project_file_tree_id = int(m.group(1))

    if project_file_tree_id is None:
        raise HTTPException(status_code=500, detail=f"ProjectFileTreeID not found in AddNewFile response: {proc_add.stdout[:300]}")

    # 5. Save forteUserRootId, projectFileTreeId, and fileId into project.json
    if forte_software is None:
        forte_software = {
            "id": "forteweb",
            "name": "ForteWEB",
            "authenticated": True,
            "username": username,
            "addedAt": int(datetime.now().timestamp() * 1000),
        }
        software_list.append(forte_software)

    forte_software["forteUserRootId"] = forte_user_root_id
    forte_software["projectFileTreeId"] = project_file_tree_id
    forte_software["fileId"] = project_file_tree_id
    if username:
        forte_software["username"] = username

    data["cloud-software"] = software_list
    data.pop("tools", None)
    data.pop("cloudSoftware", None)
    statikor_dir.mkdir(parents=True, exist_ok=True)
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    return forte_software

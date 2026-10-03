import uuid
from typing import Any
from server.dtos.forte import FortePayload, FortePostResponseData
from server.services.forte.client import (
    API_BASE_URL,
    POST_RESPONSE_DATA_KEY,
    _make_request,
    _get_forte_token,
    _get_project_file_id
)

def _open_file(token: str, file_tree_item_id: int, session_id: str) -> dict:
    return _make_request(f"{API_BASE_URL}/FileSystem/OpenFile", token, {
        "forteFileTreeItemId": file_tree_item_id,
        "receivedDataDate": None,
        "previousTreeItemId": None,
        "thisSessionId": session_id,
        POST_RESPONSE_DATA_KEY: None
    })

def _open_job(token: str, file_tree_item_id: int, session_id: str) -> dict:
    res = _make_request(f"{API_BASE_URL}/Project/OpenJob", token, {
        POST_RESPONSE_DATA_KEY: None,
        "value": file_tree_item_id,
        "sessionId": session_id
    })
    return res.get(POST_RESPONSE_DATA_KEY) or res

def _add_floor_joist(token: str, prd: dict) -> dict:
    res = _make_request(f"{API_BASE_URL}/MemberManagement/AddFloorJoist", token, FortePayload(postResponseData=prd).model_dump())
    return res.get(POST_RESPONSE_DATA_KEY) or res

def _selected_job_tree_node_changed(token: str, prd: dict) -> dict:
    last_member_id = 1
    try:
        parsed_prd = FortePostResponseData(**prd)
        containers = parsed_prd.ApplicationData.MemberManagerData.MemberContainers
        if containers and containers[0].Members:
            last_member_id = containers[0].Members[-1].MemberID
    except Exception as e:
        print(f"Error parsing DTO: {e}")
        pass
        
    res = _make_request(f"{API_BASE_URL}/MemberManagement/SelectedJobTreeNodeChanged", token, FortePayload(postResponseData=prd, containerId=0, memberId=last_member_id).model_dump())
    return res.get(POST_RESPONSE_DATA_KEY) or res

def _save_file(token: str, prd: dict) -> None:
    _make_request(f"{API_BASE_URL}/FileSystem/SaveFile", token, FortePayload(postResponseData=prd).model_dump())
    return None

def _extract_solution_summary(prd: dict) -> dict[str, Any]:
    selected_product = None
    product_passes = False
    member_id = None
    
    try:
        parsed = FortePostResponseData(**prd)
        
        containers = parsed.ApplicationData.MemberManagerData.MemberContainers
        if containers and containers[0].Members:
            member_id = containers[0].Members[-1].MemberID
            
        if parsed.MemberData and parsed.MemberData.SolutionsData:
            solutions = parsed.MemberData.SolutionsData.SolutionList
            for sol in solutions:
                if sol.IsSelected:
                    selected_product = sol.ProductLabel
                    product_passes = sol.ProductPasses
                    break
    except Exception as e:
        print(f"Error parsing final PRD: {e}")
        
    return {
        "status": "success",
        "member_id": member_id,
        "selected_product": selected_product,
        "product_passes": product_passes
    }

def add_forte_floor_joist_to_project(token: str | None = None, file_tree_item_id: int | None = None) -> dict[str, Any]:
    """Adds a new floor joist member to a ForteWEB project file and saves it.
    
    Performs the full API sequence:
    1. OpenFile
    2. OpenJob
    3. AddFloorJoist
    4. SelectedJobTreeNodeChanged
    5. SaveFile
    """
    token = token or _get_forte_token()
    file_tree_item_id = file_tree_item_id or _get_project_file_id()
    session_id = str(uuid.uuid4())
    
    _open_file(token, file_tree_item_id, session_id)
    prd = _open_job(token, file_tree_item_id, session_id)
    prd = _add_floor_joist(token, prd)
    prd = _selected_job_tree_node_changed(token, prd)
    _save_file(token, prd)
    
    return _extract_solution_summary(prd)
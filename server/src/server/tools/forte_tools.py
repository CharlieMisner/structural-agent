from langchain_core.tools import tool
from server.services.forte import add_forte_floor_joist_to_project

@tool
def add_forte_floor_joist(member_name: str | None = None, span: float | None = None) -> dict:
    """Add a new floor joist member to a ForteWEB project.
    
    Args:
        member_name: Optional name for the new joist
        span: Optional interior span length (in feet)
    """
    return add_forte_floor_joist_to_project(member_name=member_name, span=span)

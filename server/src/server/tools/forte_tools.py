from langchain_core.tools import tool
from server.services.forte import add_forte_floor_joist_to_project

@tool
def add_forte_floor_joist() -> dict:
    """Add a new floor joist member to a ForteWEB project."""
    return add_forte_floor_joist_to_project()

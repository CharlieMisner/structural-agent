from langchain_core.tools import tool

@tool
def max_moment_ss_beam(w: float, l: float) -> float:
    """
    Get the max moment of simply supported beam given line load w, and length l.

    Args:
        w: uniform distributed line load
        l: length of the span
    """
    return (w * (l ** 2)) / 8.0

tools = [
    max_moment_ss_beam
]

tools_by_name = {tool.name: tool for tool in tools}

    
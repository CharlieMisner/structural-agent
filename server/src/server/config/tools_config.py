"""Tools configuration and registry for Statikor.

Manages all available software automation tools and calculation tools registered
with the root agent.
"""

from typing import Dict, List
from langchain_core.tools import BaseTool, tool


@tool
def max_moment_ss_beam(w: float, l: float) -> float:
    """Get the max moment of simply supported beam given line load w, and length l.

    Args:
        w: uniform distributed line load
        l: length of the span
    """
    return (w * (l ** 2)) / 8.0


# Master tool registry for the root agent
tools: List[BaseTool] = [
    max_moment_ss_beam,
]

tools_by_name: Dict[str, BaseTool] = {tool.name: tool for tool in tools}

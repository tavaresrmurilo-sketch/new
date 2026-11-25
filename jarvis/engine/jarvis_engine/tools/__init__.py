"""Tool catalogue. Every capability is registered here."""

from __future__ import annotations

from .base import Tool


def all_tools() -> list[Tool]:
    from . import (app_tools, automation_tools, desktop_tools, dev_tools, file_tools, productivity_tools,
                   system_tools, vision_tools)

    return (system_tools.TOOLS + app_tools.TOOLS + file_tools.TOOLS + desktop_tools.TOOLS + productivity_tools.TOOLS
            + dev_tools.TOOLS + vision_tools.TOOLS + automation_tools.TOOLS)

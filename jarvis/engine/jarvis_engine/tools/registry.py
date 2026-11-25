"""ToolRegistry: the single catalogue of capabilities available to the agent."""

from __future__ import annotations

from typing import Any, Iterable

from .base import Tool


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> Tool:
        if tool.id in self._tools:
            raise ValueError(f"duplicate tool id: {tool.id}")
        if not tool.id.replace("_", "").isalnum():
            raise ValueError(f"tool id must be snake_case alphanumeric: {tool.id}")
        self._tools[tool.id] = tool
        return tool

    def register_all(self, tools: Iterable[Tool]) -> None:
        for t in tools:
            self.register(t)

    def get(self, tool_id: str) -> Tool | None:
        return self._tools.get(tool_id)

    def __contains__(self, tool_id: str) -> bool:
        return tool_id in self._tools

    def __len__(self) -> int:
        return len(self._tools)

    def all(self) -> list[Tool]:
        return list(self._tools.values())

    def available(self) -> list[Tool]:
        return [t for t in self._tools.values() if t.available]

    def public(self) -> list[dict[str, Any]]:
        return [t.public() for t in self._tools.values()]

"""Tool contract. Every capability Jarvis has is a registered Tool.

The language model never runs shell commands: it can only pick one of these
tools, whose parameters are validated here before the PermissionManager and
ActionExecutor ever see them.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from enum import IntEnum
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Literal

if TYPE_CHECKING:  # pragma: no cover
    from ..services.container import Services


class PermissionLevel(IntEnum):
    READ = 0  # read-only
    REVERSIBLE = 1  # common, reversible actions
    IMPORTANT = 2  # significant changes
    DESTRUCTIVE = 3  # destructive or sensitive


ParamType = Literal["string", "integer", "number", "boolean", "array"]


class ToolValidationError(ValueError):
    pass


class ToolExecutionError(RuntimeError):
    """Raised by tools for expected failures; message is user-facing (pt-BR)."""

    def __init__(self, message: str, detail: str = "") -> None:
        super().__init__(message)
        self.detail = detail


@dataclass
class ToolParam:
    name: str
    type: ParamType
    description: str
    required: bool = True
    enum: list[Any] | None = None
    default: Any = None
    minimum: float | None = None
    maximum: float | None = None
    max_length: int | None = 2000
    items: ParamType = "string"

    def schema(self) -> dict[str, Any]:
        s: dict[str, Any] = {"type": self.type, "description": self.description}
        if self.enum is not None:
            s["enum"] = self.enum
        if self.minimum is not None:
            s["minimum"] = self.minimum
        if self.maximum is not None:
            s["maximum"] = self.maximum
        if self.type == "array":
            s["items"] = {"type": self.items}
        return s

    def coerce(self, value: Any) -> Any:
        t = self.type
        if t == "string":
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                value = str(value)
            if not isinstance(value, str):
                raise ToolValidationError(f"'{self.name}' deve ser texto")
            value = value.strip()
            if self.max_length is not None and len(value) > self.max_length:
                raise ToolValidationError(f"'{self.name}' excede {self.max_length} caracteres")
            if "\x00" in value:
                raise ToolValidationError(f"'{self.name}' contém caracteres inválidos")
        elif t == "integer":
            if isinstance(value, bool):
                raise ToolValidationError(f"'{self.name}' deve ser inteiro")
            try:
                if isinstance(value, float) and not value.is_integer():
                    raise ValueError
                value = int(value)
            except (TypeError, ValueError):
                raise ToolValidationError(f"'{self.name}' deve ser inteiro") from None
        elif t == "number":
            if isinstance(value, bool):
                raise ToolValidationError(f"'{self.name}' deve ser número")
            try:
                value = float(value)
            except (TypeError, ValueError):
                raise ToolValidationError(f"'{self.name}' deve ser número") from None
        elif t == "boolean":
            if isinstance(value, str) and value.lower() in ("true", "false"):
                value = value.lower() == "true"
            if not isinstance(value, bool):
                raise ToolValidationError(f"'{self.name}' deve ser verdadeiro/falso")
        elif t == "array":
            if isinstance(value, str):
                value = [value]
            if not isinstance(value, list):
                raise ToolValidationError(f"'{self.name}' deve ser uma lista")
            inner = ToolParam(self.name, self.items, self.description, max_length=self.max_length)
            value = [inner.coerce(v) for v in value[:500]]
        if self.enum is not None and value not in self.enum:
            raise ToolValidationError(f"'{self.name}' deve ser um de: {', '.join(map(str, self.enum))}")
        if self.minimum is not None and isinstance(value, (int, float)) and value < self.minimum:
            raise ToolValidationError(f"'{self.name}' deve ser ≥ {self.minimum}")
        if self.maximum is not None and isinstance(value, (int, float)) and value > self.maximum:
            raise ToolValidationError(f"'{self.name}' deve ser ≤ {self.maximum}")
        return value


@dataclass
class ToolResult:
    ok: bool
    message: str
    data: dict[str, Any] = field(default_factory=dict)
    error: str = ""
    # Entities the ContextManager should remember (app, folder, files, note...)
    entities: dict[str, Any] = field(default_factory=dict)
    verified: bool | None = None  # None = verification not applicable

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "message": self.message,
            "data": self.data,
            "error": self.error,
            "verified": self.verified,
        }


@dataclass
class ToolContext:
    services: "Services"
    task_id: str | None = None
    source: str = "text"
    report: Callable[[str], Awaitable[None]] | None = None  # progress detail reporter

    async def progress(self, detail: str) -> None:
        if self.report:
            await self.report(detail)


Executor = Callable[[dict[str, Any], ToolContext], Awaitable[ToolResult]]
Precheck = Callable[[dict[str, Any], ToolContext], Awaitable["ToolResult | None"]]
Describer = Callable[[dict[str, Any]], str]
DynamicLevel = Callable[[dict[str, Any]], PermissionLevel]


@dataclass
class Tool:
    id: str
    name: str
    description: str
    parameters: list[ToolParam]
    level: PermissionLevel
    category: str
    run: Executor
    describe: Describer | None = None
    dynamic_level: DynamicLevel | None = None
    platforms: tuple[str, ...] = ("win32", "linux", "darwin")
    expose_to_llm: bool = True
    requires_setting: str | None = None  # e.g. "system.computer_control_enabled"
    # Cheap read-only check run *before* asking permission (e.g. "is the app even open?").
    precheck: Precheck | None = None

    @property
    def available(self) -> bool:
        return sys.platform in self.platforms or any(sys.platform.startswith(p) for p in self.platforms)

    def level_for(self, args: dict[str, Any]) -> PermissionLevel:
        if self.dynamic_level:
            return max(self.level, self.dynamic_level(args))
        return self.level

    def validate(self, args: dict[str, Any] | None) -> dict[str, Any]:
        args = dict(args or {})
        known = {p.name for p in self.parameters}
        unknown = [k for k in args if k not in known]
        if unknown:
            raise ToolValidationError(f"parâmetros desconhecidos: {', '.join(unknown)}")
        clean: dict[str, Any] = {}
        for p in self.parameters:
            if p.name not in args or args[p.name] is None or args[p.name] == "":
                if p.required and p.default is None:
                    raise ToolValidationError(f"parâmetro obrigatório ausente: '{p.name}'")
                if p.default is not None:
                    clean[p.name] = p.default
                continue
            clean[p.name] = p.coerce(args[p.name])
        return clean

    def describe_action(self, args: dict[str, Any]) -> str:
        if self.describe:
            try:
                return self.describe(args)
            except Exception:
                pass
        return self.name

    def json_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {p.name: p.schema() for p in self.parameters},
            "required": [p.name for p in self.parameters if p.required and p.default is None],
        }

    def to_llm_function(self) -> dict[str, Any]:
        return {"name": self.id, "description": self.description, "parameters": self.json_schema()}

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "level": int(self.level),
            "available": self.available,
            "parameters": [p.schema() | {"name": p.name, "required": p.required} for p in self.parameters],
        }


def tool(
    id: str,
    name: str,
    description: str,
    level: PermissionLevel,
    category: str,
    params: list[ToolParam] | None = None,
    describe: Describer | None = None,
    dynamic_level: DynamicLevel | None = None,
    platforms: tuple[str, ...] = ("win32", "linux", "darwin"),
    expose_to_llm: bool = True,
    requires_setting: str | None = None,
    precheck: Precheck | None = None,
) -> Callable[[Executor], Tool]:
    """Decorator that turns an async function into a Tool definition."""

    def wrap(fn: Executor) -> Tool:
        return Tool(
            id=id,
            name=name,
            description=description,
            parameters=params or [],
            level=level,
            category=category,
            run=fn,
            describe=describe,
            dynamic_level=dynamic_level,
            platforms=platforms,
            expose_to_llm=expose_to_llm,
            requires_setting=requires_setting,
            precheck=precheck,
        )

    return wrap


def ok(message: str, data: dict[str, Any] | None = None, entities: dict[str, Any] | None = None,
       verified: bool | None = None) -> ToolResult:
    return ToolResult(True, message, data or {}, "", entities or {}, verified)


def fail(message: str, error: str = "", data: dict[str, Any] | None = None) -> ToolResult:
    return ToolResult(False, message, data or {}, error or message)

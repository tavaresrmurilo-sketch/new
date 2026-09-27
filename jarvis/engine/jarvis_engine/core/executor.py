"""ActionExecutor: validate -> authorize -> execute -> observe -> record.

This is the only code path that runs a Tool. Both the rule-based planner and
the LLM agent loop go through here, so validation, permission checks, logging
and context updates can never be bypassed.
"""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from ..activity import Category
from ..platform.base import Unsupported
from ..security import CommandDenied, PathDenied
from ..services.hub import BridgeError
from ..tools.base import ToolContext, ToolExecutionError, ToolResult, ToolValidationError, fail

if TYPE_CHECKING:  # pragma: no cover
    from ..services.container import Services

DENY_MESSAGES = {
    "denied_policy": "Essa ação está bloqueada nas suas permissões.",
    "denied_user": "Tudo bem, não vou fazer isso.",
    "timeout": "Sem confirmação a tempo; ação cancelada.",
    "no_client": "Essa ação precisa de confirmação na interface do Jarvis, que não está aberta.",
    "cancelled": "Ação cancelada.",
}

TOOL_TIMEOUT_S = 120.0


class ActionExecutor:
    def __init__(self, services: "Services") -> None:
        self.s = services

    async def execute(self, tool_id: str, args: dict[str, Any] | None, *, task_id: str | None = None,
                      source: str = "text",
                      reporter: Callable[[str], Awaitable[None]] | None = None) -> ToolResult:
        s = self.s
        tool = s.registry.get(tool_id)
        if tool is None:
            return fail(f"Ferramenta desconhecida: {tool_id}")
        if not tool.available:
            return fail(f"'{tool.name}' não está disponível neste sistema operacional.")
        if tool.requires_setting:
            section, _, key = tool.requires_setting.partition(".")
            if not getattr(getattr(s.settings, section), key, False):
                return fail(f"'{tool.name}' está desativado nas configurações.")
        try:
            clean = tool.validate(args)
        except ToolValidationError as exc:
            s.activity.log(Category.TOOLS, f"Parâmetros inválidos para {tool.name}: {exc}", level="warning",
                           tool=tool.id)
            return fail(f"Parâmetros inválidos para {tool.name}: {exc}")

        summary = tool.describe_action(clean)
        ctx = ToolContext(services=s, task_id=task_id, source=source, report=reporter)
        if tool.precheck is not None:
            try:
                early = await tool.precheck(clean, ctx)
            except Exception:
                early = None  # a failing precheck never blocks the real execution path
            if early is not None:
                s.context.record_action(tool.id, summary, early.ok)
                return early
        decision = await s.permissions.authorize(tool, clean, summary, task_id=task_id)
        if not decision.allowed:
            s.context.record_action(tool.id, summary, False)
            return fail(DENY_MESSAGES.get(decision.reason, "Ação não autorizada."), error=decision.reason)

        started = time.time()
        s.context.current_action = summary
        await s.bus.publish("tool.started", {"tool": tool.id, "name": tool.name, "summary": summary,
                                             "level": int(tool.level_for(clean)), "taskId": task_id})
        try:
            result = await asyncio.wait_for(tool.run(clean, ctx), timeout=TOOL_TIMEOUT_S)
        except ToolExecutionError as exc:
            result = fail(str(exc), exc.detail or str(exc))
        except (PathDenied, CommandDenied) as exc:
            s.activity.log(Category.SECURITY, f"Bloqueado: {summary} — {exc}", level="warning", tool=tool.id)
            result = fail(str(exc), "security")
        except (Unsupported, BridgeError) as exc:
            result = fail(str(exc))
        except asyncio.TimeoutError:
            result = fail(f"'{tool.name}' demorou demais e foi interrompido.", "timeout")
        except asyncio.CancelledError:
            await s.bus.publish("tool.failed", {"tool": tool.id, "name": tool.name, "summary": summary,
                                                "error": "cancelled", "taskId": task_id})
            s.context.current_action = None
            raise
        except FileNotFoundError as exc:
            result = fail(f"Não encontrei: {exc.filename or exc}", str(exc))
        except PermissionError as exc:
            result = fail("O sistema negou acesso a esse item.", str(exc))
        except Exception as exc:  # unexpected: log with details, keep message friendly
            s.activity.log(Category.ERROR, f"Falha inesperada em {tool.name}", level="error", tool=tool.id,
                           error=f"{type(exc).__name__}: {exc}")
            result = fail(f"Não consegui concluir: {tool.name}.", f"{type(exc).__name__}: {exc}")
        duration_ms = int((time.time() - started) * 1000)
        s.context.current_action = None
        s.context.record_action(tool.id, summary, result.ok)
        if result.ok:
            s.context.remember(result.entities)
        s.db.execute(
            "INSERT INTO tools(tool_id, calls, failures, last_used_at) VALUES (?,1,?,?) "
            "ON CONFLICT(tool_id) DO UPDATE SET calls=calls+1, failures=failures+excluded.failures, "
            "last_used_at=excluded.last_used_at", (tool.id, 0 if result.ok else 1, time.time()))
        s.activity.log(Category.TOOLS, f"{'✓' if result.ok else '✗'} {summary}",
                       level="info" if result.ok else "warning", tool=tool.id, durationMs=duration_ms,
                       error=result.error or None, verified=result.verified)
        await s.bus.publish("tool.completed" if result.ok else "tool.failed", {
            "tool": tool.id, "name": tool.name, "summary": summary, "message": result.message,
            "error": result.error, "durationMs": duration_ms, "verified": result.verified, "taskId": task_id,
        })
        return result

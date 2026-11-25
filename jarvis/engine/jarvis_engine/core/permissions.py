"""PermissionManager: decides whether a tool call may run, and asks the user when needed.

Policy per tool: `auto` (run), `ask` (explicit confirmation), `deny` (never).
Defaults by level: 0/1 -> auto, 2 -> ask, 3 -> ask. Level 3 can never be `auto`.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

from ..activity import ActivityLog, Category
from ..db import Database, now
from ..eventbus import EventBus
from ..tools.base import PermissionLevel, Tool

Policy = Literal["auto", "ask", "deny"]
POLICIES: tuple[str, ...] = ("auto", "ask", "deny")

DEFAULT_POLICY: dict[PermissionLevel, Policy] = {
    PermissionLevel.READ: "auto",
    PermissionLevel.REVERSIBLE: "auto",
    PermissionLevel.IMPORTANT: "ask",
    PermissionLevel.DESTRUCTIVE: "ask",
}

LEVEL_LABEL = {
    PermissionLevel.READ: "Somente leitura",
    PermissionLevel.REVERSIBLE: "Ação reversível",
    PermissionLevel.IMPORTANT: "Alteração importante",
    PermissionLevel.DESTRUCTIVE: "Ação destrutiva ou sensível",
}


@dataclass
class Decision:
    allowed: bool
    reason: Literal["policy", "user", "denied_policy", "denied_user", "timeout", "no_client", "cancelled"]
    request_id: str | None = None


@dataclass
class PendingRequest:
    id: str
    tool_id: str
    level: PermissionLevel
    summary: str
    args: dict[str, Any]
    created_at: float
    future: asyncio.Future[bool] = field(repr=False)
    task_id: str | None = None
    labels: dict[str, str] = field(default_factory=dict)  # parameter name -> human description

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "toolId": self.tool_id,
            "level": int(self.level),
            "levelLabel": LEVEL_LABEL[self.level],
            "summary": self.summary,
            "args": self.args,
            "labels": self.labels,
            "createdAt": self.created_at,
            "taskId": self.task_id,
        }


class PermissionManager:
    TIMEOUT_S = 120.0

    def __init__(self, db: Database, bus: EventBus, activity: ActivityLog,
                 has_client: Callable[[], bool] = lambda: True) -> None:
        self.db = db
        self.bus = bus
        self.activity = activity
        self.has_client = has_client
        self._pending: dict[str, PendingRequest] = {}

    # ----- policies -------------------------------------------------------
    def overrides(self) -> dict[str, Policy]:
        return {r["tool_id"]: r["policy"] for r in self.db.query("SELECT tool_id, policy FROM permissions")}

    def policy_for(self, tool: Tool, level: PermissionLevel | None = None) -> Policy:
        level = tool.level if level is None else level
        override = self.overrides().get(tool.id)
        policy: Policy = override if override in POLICIES else DEFAULT_POLICY[level]  # type: ignore[assignment]
        if level >= PermissionLevel.DESTRUCTIVE and policy == "auto":
            policy = "ask"
        return policy

    def set_policy(self, tool: Tool, policy: str | None) -> Policy:
        if policy is None or policy == "default":
            self.db.execute("DELETE FROM permissions WHERE tool_id = ?", (tool.id,))
            self.activity.log(Category.SECURITY, f"Permissão de '{tool.name}' restaurada ao padrão")
            return DEFAULT_POLICY[tool.level]
        if policy not in POLICIES:
            raise ValueError("policy must be auto, ask, deny or default")
        if tool.level >= PermissionLevel.DESTRUCTIVE and policy == "auto":
            raise ValueError("Ações de nível 3 sempre exigem confirmação explícita.")
        self.db.execute(
            "INSERT INTO permissions(tool_id, policy, updated_at) VALUES (?,?,?) "
            "ON CONFLICT(tool_id) DO UPDATE SET policy=excluded.policy, updated_at=excluded.updated_at",
            (tool.id, policy, now()),
        )
        self.activity.log(Category.SECURITY, f"Permissão de '{tool.name}' alterada para {policy}")
        return policy  # type: ignore[return-value]

    # ----- runtime authorization -----------------------------------------
    async def authorize(self, tool: Tool, args: dict[str, Any], summary: str,
                        task_id: str | None = None) -> Decision:
        level = tool.level_for(args)
        policy = self.policy_for(tool, level)
        if policy == "deny":
            self.activity.log(Category.SECURITY, f"Bloqueado por política: {tool.name}", level="warning",
                              tool=tool.id)
            return Decision(False, "denied_policy")
        if policy == "auto":
            return Decision(True, "policy")
        if not self.has_client():
            self.activity.log(Category.SECURITY, f"Confirmação impossível (sem interface): {tool.name}",
                              level="warning", tool=tool.id)
            return Decision(False, "no_client")

        loop = asyncio.get_running_loop()
        req = PendingRequest(
            id=secrets.token_hex(8),
            tool_id=tool.id,
            level=level,
            summary=summary,
            args=_display_args(args),
            created_at=time.time(),
            future=loop.create_future(),
            task_id=task_id,
            labels={p.name: p.description for p in tool.parameters if p.name in args},
        )
        self._pending[req.id] = req
        self.activity.log(Category.SECURITY, f"Confirmação solicitada: {summary}", tool=tool.id, level_n=int(level))
        await self.bus.publish("permission.request", req.public())
        try:
            approved = await asyncio.wait_for(asyncio.shield(req.future), timeout=self.TIMEOUT_S)
        except asyncio.TimeoutError:
            self._finish(req, False, "timeout")
            return Decision(False, "timeout", req.id)
        except asyncio.CancelledError:
            self._finish(req, False, "cancelled")
            raise
        self._finish(req, approved, "user")
        return Decision(approved, "user" if approved else "denied_user", req.id)

    def _finish(self, req: PendingRequest, approved: bool, how: str) -> None:
        self._pending.pop(req.id, None)
        if not req.future.done():
            req.future.set_result(approved)
        self.activity.log(
            Category.SECURITY,
            f"{'Aprovado' if approved else 'Negado'} ({how}): {req.summary}",
            tool=req.tool_id,
        )
        self.bus.emit("permission.resolved", {"id": req.id, "approved": approved, "how": how})

    def respond(self, request_id: str, approved: bool) -> bool:
        req = self._pending.get(request_id)
        if not req or req.future.done():
            return False
        req.future.set_result(bool(approved))
        return True

    def current(self) -> PendingRequest | None:
        """The request the confirmation dialog is showing: the oldest pending one."""
        return min(self._pending.values(), key=lambda r: r.created_at, default=None)

    def respond_current(self, approved: bool) -> bool:
        """Voice confirmation ("sim"/"não") answers the request that is on screen."""
        req = self.current()
        return self.respond(req.id, approved) if req else False

    def cancel_all(self) -> int:
        count = 0
        for req in list(self._pending.values()):
            if not req.future.done():
                req.future.set_result(False)
                count += 1
        return count

    @property
    def pending(self) -> list[dict[str, Any]]:
        return [r.public() for r in self._pending.values()]

    def has_pending(self) -> bool:
        return bool(self._pending)


def _display_args(args: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in args.items():
        if isinstance(v, str) and len(v) > 300:
            v = v[:300] + "…"
        elif isinstance(v, list) and len(v) > 20:
            v = v[:20] + [f"… (+{len(v) - 20})"]
        out[k] = v
    return out

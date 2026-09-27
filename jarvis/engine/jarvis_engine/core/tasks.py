"""TaskManager: multi-step tasks with persisted, observable step state.

Step states: pending -> running -> completed | failed | cancelled | skipped.
Tasks can be cancelled at any time ("Jarvis, pare"); the running step's
coroutine receives CancelledError and remaining steps are marked cancelled.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from ..activity import ActivityLog, Category
from ..db import Database, now
from ..eventbus import EventBus

StepFn = Callable[["TaskRun", "Step"], Awaitable["StepOutcome"]]


@dataclass
class StepOutcome:
    ok: bool
    detail: str = ""
    skip_rest: bool = False
    message: str = ""  # user-facing message, used as task result when last


@dataclass
class Step:
    idx: int
    title: str
    fn: StepFn | None = None
    tool_id: str = ""
    status: str = "pending"
    detail: str = ""
    started_at: float | None = None
    finished_at: float | None = None
    required: bool = True

    def public(self) -> dict[str, Any]:
        return {
            "idx": self.idx, "title": self.title, "toolId": self.tool_id, "status": self.status,
            "detail": self.detail, "startedAt": self.started_at, "finishedAt": self.finished_at,
        }


@dataclass
class TaskRun:
    id: str
    title: str
    source: str
    steps: list[Step] = field(default_factory=list)
    status: str = "pending"  # pending | running | completed | failed | cancelled
    result: str = ""
    error: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    state: dict[str, Any] = field(default_factory=dict)  # shared scratchpad between steps
    handle: asyncio.Task[Any] | None = field(default=None, repr=False)

    @property
    def progress(self) -> float:
        if not self.steps:
            return 1.0 if self.status == "completed" else 0.0
        done = sum(1 for s in self.steps if s.status in ("completed", "skipped"))
        return round(done / len(self.steps), 3)

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id, "title": self.title, "source": self.source, "status": self.status,
            "progress": self.progress, "result": self.result, "error": self.error,
            "createdAt": self.created_at, "updatedAt": self.updated_at, "steps": [s.public() for s in self.steps],
        }


class TaskManager:
    def __init__(self, db: Database, bus: EventBus, activity: ActivityLog) -> None:
        self.db = db
        self.bus = bus
        self.activity = activity
        self.active: dict[str, TaskRun] = {}
        # Tasks interrupted by an engine restart can never resume: mark them.
        self.db.execute("UPDATE tasks SET status='cancelled', error='Interrompida ao reiniciar o Jarvis' "
                        "WHERE status IN ('pending','running')")
        self.db.execute("UPDATE task_steps SET status='cancelled' WHERE status IN ('pending','running')")

    def create(self, title: str, source: str = "text") -> TaskRun:
        task = TaskRun(id=secrets.token_hex(6), title=title[:200], source=source)
        try:
            # The asyncio task doing the work (command handler / tool run) is what cancel() stops.
            task.handle = asyncio.current_task()
        except RuntimeError:
            task.handle = None
        self.db.execute("INSERT INTO tasks(id, title, status, progress, source, created_at, updated_at) "
                        "VALUES (?,?,?,?,?,?,?)", (task.id, task.title, task.status, 0, source, now(), now()))
        self.active[task.id] = task
        self.bus.emit("task.created", task.public())
        return task

    def add_step(self, task: TaskRun, title: str, fn: StepFn | None = None, tool_id: str = "",
                 required: bool = True) -> Step:
        step = Step(idx=len(task.steps), title=title[:200], fn=fn, tool_id=tool_id, required=required)
        task.steps.append(step)
        self.db.execute("INSERT INTO task_steps(task_id, idx, title, tool_id, status) VALUES (?,?,?,?,?)",
                        (task.id, step.idx, step.title, tool_id, step.status))
        self._touch(task)
        return step

    async def set_step(self, task: TaskRun, step: Step, status: str, detail: str | None = None) -> None:
        step.status = status
        if detail is not None:
            step.detail = detail[:500]
        if status == "running":
            step.started_at = time.time()
        elif status in ("completed", "failed", "cancelled", "skipped"):
            step.finished_at = time.time()
        self.db.execute("UPDATE task_steps SET status=?, detail=?, started_at=?, finished_at=? "
                        "WHERE task_id=? AND idx=?",
                        (step.status, step.detail, step.started_at, step.finished_at, task.id, step.idx))
        await self._publish(task)

    async def set_status(self, task: TaskRun, status: str, result: str = "", error: str = "") -> None:
        task.status = status
        if result:
            task.result = result[:2000]
        if error:
            task.error = error[:2000]
        await self._publish(task)
        if status in ("completed", "failed", "cancelled"):
            self.active.pop(task.id, None)
            level = {"completed": "info", "failed": "warning", "cancelled": "info"}[status]
            self.activity.log(Category.TASKS, f"Tarefa {status}: {task.title}", level=level,
                              steps=len(task.steps), error=task.error)

    async def _publish(self, task: TaskRun) -> None:
        self._touch(task)
        await self.bus.publish("task.updated", task.public())

    def _touch(self, task: TaskRun) -> None:
        task.updated_at = time.time()
        self.db.execute("UPDATE tasks SET status=?, progress=?, result=?, error=?, updated_at=? WHERE id=?",
                        (task.status, task.progress, task.result, task.error, task.updated_at, task.id))

    async def run(self, task: TaskRun) -> TaskRun:
        """Run function steps sequentially (planner-built tasks)."""
        await self.set_status(task, "running")
        final_message = ""
        try:
            for step in task.steps:
                if step.status != "pending":
                    continue
                await self.set_step(task, step, "running")
                assert step.fn is not None
                try:
                    outcome = await step.fn(task, step)
                except asyncio.CancelledError:
                    await self.set_step(task, step, "cancelled", "Cancelado pelo usuário")
                    raise
                except Exception as exc:
                    outcome = StepOutcome(False, f"Erro: {exc}")
                await self.set_step(task, step, "completed" if outcome.ok else "failed", outcome.detail)
                if outcome.message:
                    final_message = outcome.message
                if not outcome.ok and step.required:
                    for rest in task.steps[step.idx + 1:]:
                        await self.set_step(task, rest, "cancelled")
                    await self.set_status(task, "failed", result=final_message, error=outcome.detail)
                    return task
                if outcome.skip_rest:
                    for rest in task.steps[step.idx + 1:]:
                        await self.set_step(task, rest, "skipped")
                    break
            await self.set_status(task, "completed", result=final_message)
        except asyncio.CancelledError:
            for rest in task.steps:
                if rest.status in ("pending", "running"):
                    await self.set_step(task, rest, "cancelled")
            await self.set_status(task, "cancelled", error="Cancelada pelo usuário")
        return task

    def cancel(self, task_id: str) -> bool:
        task = self.active.get(task_id)
        if not task or not task.handle or task.handle.done():
            return False
        task.handle.cancel()
        return True

    def cancel_all(self) -> int:
        n = 0
        for task in list(self.active.values()):
            if task.handle and not task.handle.done():
                task.handle.cancel()
                n += 1
        return n

    def list(self, limit: int = 30) -> list[dict[str, Any]]:
        rows = self.db.query("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", (max(1, min(limit, 200)),))
        out = []
        for r in rows:
            live = self.active.get(r["id"])
            if live:
                out.append(live.public())
                continue
            steps = self.db.query("SELECT idx, title, tool_id, status, detail, started_at, finished_at "
                                  "FROM task_steps WHERE task_id=? ORDER BY idx", (r["id"],))
            out.append({
                "id": r["id"], "title": r["title"], "source": r["source"], "status": r["status"],
                "progress": r["progress"], "result": r["result"], "error": r["error"],
                "createdAt": r["created_at"], "updatedAt": r["updated_at"],
                "steps": [{"idx": s["idx"], "title": s["title"], "toolId": s["tool_id"], "status": s["status"],
                           "detail": s["detail"], "startedAt": s["started_at"], "finishedAt": s["finished_at"]}
                          for s in steps],
            })
        return out

    def clear_history(self) -> int:
        n = int(self.db.scalar("SELECT COUNT(*) FROM tasks WHERE status NOT IN ('pending','running')") or 0)
        self.db.execute("DELETE FROM tasks WHERE status NOT IN ('pending','running')")
        return n

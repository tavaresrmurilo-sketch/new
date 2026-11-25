"""Reminder engine: persistent reminders with one-shot or recurring schedules.

A single asyncio task sleeps until the next due reminder (re-armed whenever the
set changes). On fire it publishes `reminder.fired`, which the notification
layer turns into a desktop toast, an in-app alert and (optionally) speech.
Reminders missed while Jarvis was closed fire once at startup, flagged late.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from ..activity import ActivityLog, Category
from ..core.timeparse import describe_due, next_occurrence
from ..db import Database, dumps, loads, now
from ..eventbus import EventBus

LATE_GRACE_S = 24 * 3600


class ReminderEngine:
    def __init__(self, db: Database, bus: EventBus, activity: ActivityLog) -> None:
        self.db = db
        self.bus = bus
        self.activity = activity
        self._wake = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    # ---------------------------------------------------------------- CRUD
    def create(self, text: str, due: datetime, recurrence: dict[str, Any] | None = None) -> dict[str, Any]:
        ts = now()
        cur = self.db.execute(
            "INSERT INTO reminders(text, due_at, recurrence, status, created_at) VALUES (?,?,?,?,?)",
            (text.strip()[:500], due.timestamp(), dumps(recurrence) if recurrence else "", "pending", ts))
        rem = self.get(int(cur.lastrowid))
        assert rem
        self._wake.set()
        self.bus.emit("reminders.updated", {"action": "created", "reminder": rem})
        return rem

    def get(self, rid: int) -> dict[str, Any] | None:
        row = self.db.one("SELECT * FROM reminders WHERE id = ?", (rid,))
        return self._public(row) if row else None

    def cancel(self, rid: int) -> bool:
        cur = self.db.execute("UPDATE reminders SET status='cancelled' WHERE id=? AND status='pending'", (rid,))
        if cur.rowcount:
            self._wake.set()
            self.bus.emit("reminders.updated", {"action": "cancelled", "reminder": self.get(rid)})
            return True
        return False

    def delete(self, rid: int) -> bool:
        cur = self.db.execute("DELETE FROM reminders WHERE id = ?", (rid,))
        if cur.rowcount:
            self._wake.set()
            self.bus.emit("reminders.updated", {"action": "deleted", "reminder": {"id": rid}})
        return bool(cur.rowcount)

    def list(self, status: str | None = "pending", limit: int = 100) -> list[dict[str, Any]]:
        if status:
            rows = self.db.query("SELECT * FROM reminders WHERE status = ? ORDER BY due_at LIMIT ?", (status, limit))
        else:
            rows = self.db.query("SELECT * FROM reminders ORDER BY due_at DESC LIMIT ?", (limit,))
        return [self._public(r) for r in rows]

    def between(self, start: float, end: float) -> list[dict[str, Any]]:
        rows = self.db.query("SELECT * FROM reminders WHERE status='pending' AND due_at >= ? AND due_at < ? "
                             "ORDER BY due_at", (start, end))
        return [self._public(r) for r in rows]

    @staticmethod
    def _public(row: dict[str, Any]) -> dict[str, Any]:
        rec = loads(row.get("recurrence"), None)
        due = datetime.fromtimestamp(row["due_at"]).astimezone()
        return {
            "id": row["id"], "text": row["text"], "dueAt": row["due_at"], "recurrence": rec,
            "status": row["status"], "createdAt": row["created_at"], "lastFiredAt": row.get("last_fired_at"),
            "when": describe_due(due, rec),
        }

    # ------------------------------------------------------------- engine
    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="reminders")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        await self._fire_due(startup=True)
        while True:
            nxt = self.db.scalar("SELECT MIN(due_at) FROM reminders WHERE status='pending'")
            timeout = 3600.0 if nxt is None else max(0.0, min(3600.0, float(nxt) - now()))
            self._wake.clear()
            try:
                await asyncio.wait_for(self._wake.wait(), timeout=timeout)
                continue  # set changed; recompute
            except asyncio.TimeoutError:
                pass
            await self._fire_due()

    async def _fire_due(self, startup: bool = False) -> None:
        ts = now()
        due_rows = self.db.query("SELECT * FROM reminders WHERE status='pending' AND due_at <= ? ORDER BY due_at",
                                 (ts + 0.5,))
        for row in due_rows:
            late = ts - row["due_at"] > 90
            rec = loads(row.get("recurrence"), None)
            if late and ts - row["due_at"] > LATE_GRACE_S and not rec:
                self.db.execute("UPDATE reminders SET status='missed' WHERE id=?", (row["id"],))
                continue
            if rec:
                nxt = next_occurrence(rec, datetime.fromtimestamp(ts).astimezone())
                self.db.execute("UPDATE reminders SET due_at=?, last_fired_at=? WHERE id=?",
                                (nxt.timestamp() if nxt else ts + 86400, ts, row["id"]))
            else:
                self.db.execute("UPDATE reminders SET status='done', last_fired_at=? WHERE id=?", (ts, row["id"]))
            payload = self._public(self.db.one("SELECT * FROM reminders WHERE id=?", (row["id"],)) or row)
            payload["late"] = late
            self.activity.log(Category.TASKS, f"Lembrete disparado: {row['text']}", late=late)
            await self.bus.publish("reminder.fired", payload)
            await self.bus.publish("reminders.updated", {"action": "fired", "reminder": payload})

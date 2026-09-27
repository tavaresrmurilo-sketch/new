"""Structured activity log (categories SYSTEM/VOICE/AI/TOOLS/TASKS/ERROR/SECURITY).

Every entry goes to three places: the `activity_logs` table (for the ACTIVITY
screen), a rotating JSON-lines file, and the event bus (`activity.log`).
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import time
from enum import Enum
from pathlib import Path
from typing import Any

from .db import Database, dumps
from .eventbus import EventBus


class Category(str, Enum):
    SYSTEM = "SYSTEM"
    VOICE = "VOICE"
    AI = "AI"
    TOOLS = "TOOLS"
    TASKS = "TASKS"
    ERROR = "ERROR"
    SECURITY = "SECURITY"


_SENSITIVE_KEYS = ("key", "token", "secret", "password", "authorization", "cookie")


def redact(data: Any) -> Any:
    if isinstance(data, dict):
        return {
            k: ("[redacted]" if any(s in str(k).lower() for s in _SENSITIVE_KEYS) else redact(v))
            for k, v in data.items()
        }
    if isinstance(data, list):
        return [redact(v) for v in data[:50]]
    if isinstance(data, str) and len(data) > 2000:
        return data[:2000] + "…"
    return data


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": round(record.created, 3),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        extra = getattr(record, "jarvis", None)
        if extra:
            payload.update(extra)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(logs_dir: Path, dev: bool = False) -> None:
    logs_dir.mkdir(parents=True, exist_ok=True)
    root = logging.getLogger("jarvis")
    root.setLevel(logging.DEBUG if dev else logging.INFO)
    root.propagate = False
    if not any(isinstance(h, logging.handlers.RotatingFileHandler) for h in root.handlers):
        fh = logging.handlers.RotatingFileHandler(
            logs_dir / "engine.jsonl", maxBytes=5_000_000, backupCount=3, encoding="utf-8"
        )
        fh.setFormatter(_JsonFormatter())
        root.addHandler(fh)
        sh = logging.StreamHandler()
        sh.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
        root.addHandler(sh)


class ActivityLog:
    MAX_ROWS = 5000

    def __init__(self, db: Database, bus: EventBus) -> None:
        self.db = db
        self.bus = bus
        self.logger = logging.getLogger("jarvis.activity")
        self._writes = 0

    def log(self, category: Category | str, message: str, level: str = "info", **data: Any) -> dict[str, Any]:
        cat = category.value if isinstance(category, Category) else str(category)
        clean = redact(data)
        ts = time.time()
        cur = self.db.execute(
            "INSERT INTO activity_logs(ts, category, level, message, data) VALUES (?,?,?,?,?)",
            (ts, cat, level, message, dumps(clean)),
        )
        entry = {"id": cur.lastrowid, "ts": ts, "category": cat, "level": level, "message": message, "data": clean}
        py_level = {"debug": 10, "info": 20, "warning": 30, "error": 40}.get(level, 20)
        self.logger.log(py_level, message, extra={"jarvis": {"category": cat, "data": clean}})
        self.bus.emit("activity.log", entry)
        self._writes += 1
        if self._writes % 200 == 0:
            self.prune()
        return entry

    def prune(self, retention_days: int | None = None) -> None:
        self.db.execute(
            "DELETE FROM activity_logs WHERE id <= (SELECT id FROM activity_logs ORDER BY id DESC LIMIT 1 OFFSET ?)",
            (self.MAX_ROWS,),
        )
        if retention_days:
            self.db.execute("DELETE FROM activity_logs WHERE ts < ?", (time.time() - retention_days * 86400,))

    def list(self, limit: int = 200, category: str | None = None, query: str | None = None) -> list[dict[str, Any]]:
        sql = "SELECT * FROM activity_logs"
        where: list[str] = []
        params: list[Any] = []
        if category:
            where.append("category = ?")
            params.append(category)
        if query:
            where.append("message LIKE ?")
            params.append(f"%{query}%")
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(max(1, min(limit, 1000)))
        rows = self.db.query(sql, params)
        for r in rows:
            try:
                r["data"] = json.loads(r["data"])
            except ValueError:
                r["data"] = {}
        return rows

    def clear(self) -> int:
        count = self.db.scalar("SELECT COUNT(*) FROM activity_logs") or 0
        self.db.execute("DELETE FROM activity_logs")
        return int(count)

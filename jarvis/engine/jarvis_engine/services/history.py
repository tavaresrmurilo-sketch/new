"""Conversation history (optional: Settings › Privacidade › Histórico)."""

from __future__ import annotations

import time
from typing import Any

from ..db import Database, dumps, loads, now
from ..settings import SettingsManager


class HistoryStore:
    def __init__(self, db: Database, settings: SettingsManager) -> None:
        self.db = db
        self.settings = settings
        self.conversation_id: int | None = None

    def _conversation(self) -> int:
        if self.conversation_id is None:
            cur = self.db.execute("INSERT INTO conversations(started_at, title) VALUES (?, '')", (now(),))
            self.conversation_id = int(cur.lastrowid)
        return self.conversation_id

    def add(self, role: str, content: str, meta: dict[str, Any] | None = None) -> None:
        if not self.settings.privacy.history_enabled or not content:
            return
        cid = self._conversation()
        self.db.execute("INSERT INTO messages(conversation_id, role, content, meta, created_at) VALUES (?,?,?,?,?)",
                        (cid, role, content[:8000], dumps(meta or {}), now()))
        if role == "user":
            self.db.execute("UPDATE conversations SET title = ? WHERE id = ? AND title = ''", (content[:80], cid))

    def conversations(self, limit: int = 30) -> list[dict[str, Any]]:
        return self.db.query(
            "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS count "
            "FROM conversations c ORDER BY c.started_at DESC LIMIT ?", (limit,))

    def messages(self, conversation_id: int | None = None, limit: int = 200) -> list[dict[str, Any]]:
        cid = conversation_id or self.conversation_id
        if cid is None:
            return []
        rows = self.db.query("SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?", (cid, limit))
        for r in rows:
            r["meta"] = loads(r["meta"], {})
        return list(reversed(rows))

    def count(self) -> int:
        return int(self.db.scalar("SELECT COUNT(*) FROM messages") or 0)

    def clear(self) -> int:
        n = self.count()
        self.db.execute("DELETE FROM messages")
        self.db.execute("DELETE FROM conversations")
        self.conversation_id = None
        return n

    def prune(self) -> None:
        days = self.settings.privacy.history_retention_days
        cutoff = time.time() - days * 86400
        self.db.execute("DELETE FROM conversations WHERE started_at < ?", (cutoff,))

"""Notes store (SQLite + FTS5)."""

from __future__ import annotations

from typing import Any

from ..db import Database, fts_query, now
from ..eventbus import EventBus


class NotesStore:
    def __init__(self, db: Database, bus: EventBus) -> None:
        self.db = db
        self.bus = bus

    def create(self, content: str, title: str = "", tags: str = "") -> dict[str, Any]:
        content = content.strip()
        title = (title or "").strip()[:200]
        if not title:
            first = content.split("\n", 1)[0]
            title = (first[:60] + "…") if len(first) > 60 else first
        ts = now()
        cur = self.db.execute("INSERT INTO notes(title, content, tags, created_at, updated_at) VALUES (?,?,?,?,?)",
                              (title, content, tags.strip()[:200], ts, ts))
        note = self.get(int(cur.lastrowid))
        assert note
        self.bus.emit("notes.updated", {"action": "created", "note": note})
        return note

    def get(self, note_id: int) -> dict[str, Any] | None:
        return self.db.one("SELECT * FROM notes WHERE id = ?", (note_id,))

    def update(self, note_id: int, *, title: str | None = None, content: str | None = None,
               tags: str | None = None) -> dict[str, Any] | None:
        note = self.get(note_id)
        if not note:
            return None
        self.db.execute(
            "UPDATE notes SET title=?, content=?, tags=?, updated_at=? WHERE id=?",
            (title.strip()[:200] if title is not None else note["title"],
             content if content is not None else note["content"],
             tags.strip()[:200] if tags is not None else note["tags"], now(), note_id),
        )
        updated = self.get(note_id)
        self.bus.emit("notes.updated", {"action": "updated", "note": updated})
        return updated

    def delete(self, note_id: int) -> bool:
        note = self.get(note_id)
        if not note:
            return False
        self.db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
        self.bus.emit("notes.updated", {"action": "deleted", "note": note})
        return True

    def list(self, limit: int = 50) -> list[dict[str, Any]]:
        return self.db.query("SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?", (max(1, min(limit, 500)),))

    def search(self, text: str, limit: int = 20) -> list[dict[str, Any]]:
        match = fts_query(text)
        if not match:
            return self.list(limit)
        rows = self.db.query(
            "SELECT n.*, snippet(notes_fts, 1, '[', ']', '…', 10) AS snippet FROM notes_fts "
            "JOIN notes n ON n.id = notes_fts.rowid WHERE notes_fts MATCH ? ORDER BY bm25(notes_fts, 3.0, 1.0, 1.0) "
            "LIMIT ?", (match, max(1, min(limit, 200))))
        return rows

    def find_by_title(self, title: str) -> dict[str, Any] | None:
        row = self.db.one("SELECT * FROM notes WHERE lower(title) = lower(?) ORDER BY updated_at DESC LIMIT 1",
                          (title.strip(),))
        if row:
            return row
        hits = self.search(title, limit=1)
        return hits[0] if hits else None

    def count(self) -> int:
        return int(self.db.scalar("SELECT COUNT(*) FROM notes") or 0)

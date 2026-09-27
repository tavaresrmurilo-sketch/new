"""MemoryManager: what Jarvis remembers, and only what it was allowed to.

Layers
- short-term: the current conversation window (ContextManager, in memory)
- session: what happened since the engine started (ContextManager.session)
- long-term: facts the user explicitly asked Jarvis to remember (this table)
- task memory: projects and ongoing tasks (category "task" / "project")
- preferences: explicit preferences (category "preference")

Nothing is written to long-term memory implicitly.
"""

from __future__ import annotations

import re
from typing import Any

from ..db import Database, fts_query, now
from ..eventbus import EventBus

CATEGORIES = ("fact", "preference", "project", "task", "person", "other")

_CATEGORY_HINTS = [
    (re.compile(r"\b(prefiro|gosto de|nao gosto|odeio|prefer|i like|i prefer|sempre use|always use)\b", re.I),
     "preference"),
    (re.compile(r"\b(projeto|project|repositorio|repo)\b", re.I), "project"),
    (re.compile(r"\b(preciso|tenho que|devo|tarefa|to-?do|need to|have to)\b", re.I), "task"),
    (re.compile(r"\b(meu (?:pai|mae|irmao|irma|chefe|amigo|filho|filha)|aniversario|birthday|esposa|marido)\b", re.I),
     "person"),
]


def infer_category(text: str) -> str:
    from ..core.text import strip_accents

    folded = strip_accents(text.lower())
    for rx, cat in _CATEGORY_HINTS:
        if rx.search(folded):
            return cat
    return "fact"


class MemoryManager:
    def __init__(self, db: Database, bus: EventBus) -> None:
        self.db = db
        self.bus = bus

    def add(self, content: str, category: str | None = None, source: str = "manual", tags: str = "") -> dict[str, Any]:
        content = content.strip()
        if not content:
            raise ValueError("memória vazia")
        cat = category if category in CATEGORIES else infer_category(content)
        dup = self.db.one("SELECT * FROM memories WHERE lower(content) = lower(?)", (content,))
        if dup:
            return dup
        ts = now()
        cur = self.db.execute(
            "INSERT INTO memories(category, content, source, tags, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (cat, content[:2000], source, tags.strip()[:200], ts, ts))
        mem = self.get(int(cur.lastrowid))
        assert mem
        self.bus.emit("memory.updated", {"action": "created", "memory": mem})
        return mem

    def get(self, mid: int) -> dict[str, Any] | None:
        return self.db.one("SELECT * FROM memories WHERE id = ?", (mid,))

    def update(self, mid: int, *, content: str | None = None, category: str | None = None,
               tags: str | None = None) -> dict[str, Any] | None:
        mem = self.get(mid)
        if not mem:
            return None
        if category is not None and category not in CATEGORIES:
            raise ValueError("categoria inválida")
        self.db.execute(
            "UPDATE memories SET content=?, category=?, tags=?, updated_at=? WHERE id=?",
            ((content or mem["content"]).strip()[:2000], category or mem["category"],
             tags.strip()[:200] if tags is not None else mem["tags"], now(), mid))
        updated = self.get(mid)
        self.bus.emit("memory.updated", {"action": "updated", "memory": updated})
        return updated

    def delete(self, mid: int) -> bool:
        mem = self.get(mid)
        if not mem:
            return False
        self.db.execute("DELETE FROM memories WHERE id = ?", (mid,))
        self.bus.emit("memory.updated", {"action": "deleted", "memory": mem})
        return True

    def list(self, category: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        if category:
            return self.db.query("SELECT * FROM memories WHERE category=? ORDER BY updated_at DESC LIMIT ?",
                                 (category, limit))
        return self.db.query("SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?", (limit,))

    def search(self, text: str, limit: int = 10, category: str | None = None) -> list[dict[str, Any]]:
        match = fts_query(text)
        if not match:
            return self.list(category, limit)
        # OR semantics: any meaningful word can surface a memory.
        or_match = " OR ".join(match.split(" "))
        sql = ("SELECT m.*, bm25(memories_fts) AS rank FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid "
               "WHERE memories_fts MATCH ?")
        params: list[Any] = [or_match]
        if category:
            sql += " AND m.category = ?"
            params.append(category)
        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)
        rows = self.db.query(sql, params)
        for r in rows:
            r.pop("rank", None)
        return rows

    def relevant(self, text: str, limit: int = 5) -> list[dict[str, Any]]:
        stop = {"jarvis", "voce", "você", "que", "qual", "quais", "como", "para", "meu", "minha", "sobre", "the",
                "what", "sabe", "about", "know", "de", "do", "da", "o", "a", "e"}
        words = [w for w in re.findall(r"\w+", text.lower()) if w not in stop and len(w) > 2]
        if not words:
            return []
        return self.search(" ".join(words), limit=limit)

    def forget_matching(self, text: str) -> list[dict[str, Any]]:
        return self.search(text, limit=20)

    def count(self) -> int:
        return int(self.db.scalar("SELECT COUNT(*) FROM memories") or 0)

    def clear(self) -> int:
        n = self.count()
        self.db.execute("DELETE FROM memories")
        self.bus.emit("memory.updated", {"action": "cleared"})
        return n

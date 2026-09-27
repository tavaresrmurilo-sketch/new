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



_STOP = {"jarvis", "voce", "você", "que", "qual", "quais", "como", "para", "meu", "minha", "meus", "minhas", "sobre",
         "the", "what", "sabe", "about", "know", "de", "do", "da", "o", "a", "e", "isso", "disso", "esse", "essa"}


def _keywords(text: str) -> list[str]:
    return [w for w in re.findall(r"\w+", text.lower()) if w not in _STOP and len(w) > 2]


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

    def search(self, text: str, limit: int = 10, category: str | None = None,
               match_all: bool = False) -> list[dict[str, Any]]:
        match = fts_query(text)
        if not match:
            return self.list(category, limit)
        # OR semantics for recall (any meaningful word can surface a memory); AND when deleting.
        sql = ("SELECT m.*, bm25(memories_fts) AS rank FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid "
               "WHERE memories_fts MATCH ?")
        params: list[Any] = [match if match_all else " OR ".join(match.split(" "))]
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
        words = _keywords(text)
        return self.search(" ".join(words), limit=limit) if words else []

    def forget_matching(self, text: str) -> list[dict[str, Any]]:
        # Only memories containing every meaningful word: "esqueça que meu carro é azul" must not
        # delete everything else that mentions "meu".
        words = _keywords(text)
        return self.search(" ".join(words), limit=20, match_all=True) if words else []

    def count(self) -> int:
        return int(self.db.scalar("SELECT COUNT(*) FROM memories") or 0)

    def clear(self) -> int:
        n = self.count()
        self.db.execute("DELETE FROM memories")
        self.bus.emit("memory.updated", {"action": "cleared"})
        return n

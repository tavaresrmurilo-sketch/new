"""ContextManager: short-term conversation memory and reference resolution.

Tools report the entities they touched (app, folder, files, project, note...).
Follow-up commands such as "agora diminua ele", "abra o mais recente" or
"abra o VS Code nessa pasta" are resolved against these entities.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

ENTITY_KINDS = ("app", "folder", "file", "files", "project", "note", "notes", "process", "url", "reminder",
                "memory", "terminal", "window", "query", "topic")


@dataclass
class Entity:
    kind: str
    value: Any
    label: str
    ts: float = field(default_factory=time.time)


class ContextManager:
    def __init__(self, max_turns: int = 16) -> None:
        self.turns: deque[dict[str, Any]] = deque(maxlen=max_turns)
        self.entities: dict[str, Entity] = {}
        self.session_started = time.time()
        self.commands = 0
        self.actions: deque[dict[str, Any]] = deque(maxlen=50)
        self.current_task: dict[str, Any] | None = None
        self.current_action: str | None = None
        self.next_steps: list[str] = []
        self.conversation_id: int | None = None

    # -------------------------------------------------------------- turns
    def add_turn(self, role: str, content: str) -> None:
        self.turns.append({"role": role, "content": content[:4000], "ts": time.time()})
        if role == "user":
            self.commands += 1

    def history(self, limit: int = 10) -> list[dict[str, Any]]:
        return list(self.turns)[-limit:]

    # ----------------------------------------------------------- entities
    def remember(self, entities: dict[str, Any]) -> None:
        for kind, value in entities.items():
            if kind not in ENTITY_KINDS or value in (None, "", []):
                continue
            label = _label(kind, value)
            self.entities[kind] = Entity(kind, value, label)

    def get(self, kind: str) -> Any:
        e = self.entities.get(kind)
        return e.value if e else None

    def most_recent(self, kinds: tuple[str, ...] | list[str]) -> Entity | None:
        found = [self.entities[k] for k in kinds if k in self.entities]
        return max(found, key=lambda e: e.ts) if found else None

    def latest_file_or_folder(self) -> str | None:
        e = self.most_recent(("file", "folder", "project"))
        if e is None:
            return None
        if isinstance(e.value, dict):
            return e.value.get("path")
        return str(e.value)

    def pick_from_results(self, selector: str) -> dict[str, Any] | None:
        """Resolve "o mais recente", "o primeiro", "o segundo", "o último" against the last result list."""
        files = self.get("files") or []
        if not files:
            return None
        sel = selector.lower()
        if any(w in sel for w in ("recente", "novo", "newest", "latest", "recent")):
            return max(files, key=lambda f: f.get("mtime", 0))
        if any(w in sel for w in ("antigo", "velho", "oldest")):
            return min(files, key=lambda f: f.get("mtime", 0))
        ordinals = {"primeiro": 0, "primeira": 0, "first": 0, "1": 0, "segundo": 1, "segunda": 1, "second": 1,
                    "2": 1, "terceiro": 2, "terceira": 2, "third": 2, "3": 2, "quarto": 3, "quarta": 3, "4": 3,
                    "quinto": 4, "5": 4, "ultimo": -1, "ultima": -1, "last": -1}
        for word, idx in ordinals.items():
            if f" {word}" in f" {sel}":
                try:
                    return files[idx]
                except IndexError:
                    return None
        return None

    # --------------------------------------------------------------- task
    def set_task(self, task: dict[str, Any] | None, next_steps: list[str] | None = None) -> None:
        self.current_task = task
        self.next_steps = next_steps or []

    def record_action(self, tool_id: str, summary: str, ok: bool) -> None:
        self.actions.append({"tool": tool_id, "summary": summary, "ok": ok, "ts": time.time()})

    # ------------------------------------------------------------ outputs
    def summary(self) -> str:
        lines = []
        for kind in ("app", "folder", "project", "file", "files", "note", "process", "url", "terminal"):
            e = self.entities.get(kind)
            if e and time.time() - e.ts < 3600:
                lines.append(f"- {kind}: {e.label}")
        if self.current_task:
            lines.append(f"- tarefa atual: {self.current_task.get('title')}")
        return "\n".join(lines) if lines else "- (nenhum)"

    def public(self) -> dict[str, Any]:
        return {
            "entities": {k: {"label": e.label, "ts": e.ts} for k, e in self.entities.items()},
            "currentTask": self.current_task,
            "currentAction": self.current_action,
            "nextSteps": self.next_steps,
            "recentActions": list(self.actions)[-8:],
            "session": {"startedAt": self.session_started, "commands": self.commands},
        }


def _label(kind: str, value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or value.get("title") or value.get("label") or value.get("path") or kind)[:120]
    if isinstance(value, list):
        return f"{len(value)} itens"
    return str(value)[:120]

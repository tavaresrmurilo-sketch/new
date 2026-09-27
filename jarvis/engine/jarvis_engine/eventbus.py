"""Internal publish/subscribe bus that decouples engine modules from the UI.

Event names follow `<domain>.<action>` (e.g. `tool.started`, `system.metrics`).
Subscribers may use exact names, a `domain.*` prefix, or `*` for everything.
"""

from __future__ import annotations

import asyncio
import inspect
import itertools
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Union

log = logging.getLogger("jarvis.eventbus")

Handler = Callable[["Event"], Union[None, Awaitable[None]]]
_ids = itertools.count(1)


@dataclass(frozen=True)
class Event:
    name: str
    data: dict[str, Any]
    ts: float = field(default_factory=time.time)
    id: int = field(default_factory=lambda: next(_ids))

    def to_wire(self) -> dict[str, Any]:
        return {"type": "event", "event": self.name, "data": self.data, "ts": self.ts, "id": self.id}


def _matches(pattern: str, name: str) -> bool:
    if pattern == "*" or pattern == name:
        return True
    if pattern.endswith(".*"):
        return name.startswith(pattern[:-1])
    return False


class EventBus:
    def __init__(self) -> None:
        self._subs: list[tuple[str, Handler]] = []
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, pattern: str, handler: Handler) -> Callable[[], None]:
        entry = (pattern, handler)
        self._subs.append(entry)

        def unsubscribe() -> None:
            try:
                self._subs.remove(entry)
            except ValueError:
                pass

        return unsubscribe

    async def publish(self, name: str, data: dict[str, Any] | None = None) -> Event:
        event = Event(name=name, data=data or {})
        for pattern, handler in list(self._subs):
            if not _matches(pattern, name):
                continue
            try:
                result = handler(event)
                if inspect.isawaitable(result):
                    await result
            except Exception:  # a faulty subscriber must never break the publisher
                log.exception("event handler failed for %s", name)
        return event

    def emit(self, name: str, data: dict[str, Any] | None = None) -> None:
        """Fire-and-forget publish, safe to call from any thread."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is loop:
            loop.create_task(self.publish(name, data))
        else:
            asyncio.run_coroutine_threadsafe(self.publish(name, data), loop)

"""Notifications + proactive assistance.

Proactive alerts are opt-out (Settings › Sistema) and deliberately quiet:
each alert type needs a sustained condition and has a long cooldown, and all of
them are muted in focus mode. Reminders always fire (the user created them).
"""

from __future__ import annotations

import asyncio
import secrets
import time
from collections import deque
from typing import TYPE_CHECKING, Any

from ..activity import Category
from ..eventbus import Event
from .hub import BridgeError

if TYPE_CHECKING:  # pragma: no cover
    from .container import Services


class Notifier:
    COOLDOWNS = {"memory": 1800, "cpu": 1800, "disk": 6 * 3600, "battery": 1800, "task": 0, "project": 300}
    SUSTAIN = {"memory": 60, "cpu": 120}

    def __init__(self, services: "Services") -> None:
        self.s = services
        self.items: deque[dict[str, Any]] = deque(maxlen=100)
        self.focus_mode = False
        self._last_sent: dict[str, float] = {}
        self._over_since: dict[str, float] = {}
        self._unsubs: list[Any] = []

    def start(self) -> None:
        bus = self.s.bus
        self._unsubs = [
            bus.subscribe("system.metrics", self._on_metrics),
            bus.subscribe("reminder.fired", self._on_reminder),
            bus.subscribe("task.updated", self._on_task),
            bus.subscribe("terminal.exited", self._on_terminal_exit),
        ]

    def stop(self) -> None:
        for u in self._unsubs:
            u()

    async def notify(self, title: str, body: str = "", kind: str = "info", desktop: bool = True,
                     speak: bool = False, source: str = "") -> dict[str, Any]:
        item = {"id": secrets.token_hex(5), "title": title[:120], "body": body[:500], "kind": kind,
                "ts": time.time(), "source": source, "read": False}
        self.items.appendleft(item)
        await self.s.bus.publish("notification", item)
        if desktop and self.s.hub.has_capability("notifications"):
            try:
                await self.s.hub.request("notifications", "notify", {"title": item["title"], "body": item["body"],
                                                                     "kind": kind}, timeout=5)
            except BridgeError:
                pass
        if speak:
            asyncio.create_task(self.s.voice.speak(f"{title}. {body}".strip(". ")))
        return item

    def list(self) -> list[dict[str, Any]]:
        return list(self.items)

    def mark_read(self, ids: list[str] | None = None) -> None:
        for it in self.items:
            if ids is None or it["id"] in ids:
                it["read"] = True

    def clear(self) -> None:
        self.items.clear()

    # ------------------------------------------------------------ rules
    def _allowed(self, key: str) -> bool:
        if not self.s.settings.system.proactive_enabled or self.focus_mode:
            return False
        last = self._last_sent.get(key, 0.0)
        if time.time() - last < self.COOLDOWNS.get(key, 600):
            return False
        return True

    def _sustained(self, key: str, condition: bool) -> bool:
        now = time.time()
        if not condition:
            self._over_since.pop(key, None)
            return False
        since = self._over_since.setdefault(key, now)
        return now - since >= self.SUSTAIN.get(key, 0)

    async def _alert(self, key: str, title: str, body: str) -> None:
        if not self._allowed(key):
            return
        self._last_sent[key] = time.time()
        self.s.activity.log(Category.SYSTEM, f"Alerta proativo: {title}", body=body)
        await self.notify(title, body, kind="warning", desktop=True, source="proactive")

    async def _on_metrics(self, ev: Event) -> None:
        d = ev.data
        th = self.s.settings.system.alerts
        mem = (d.get("memory") or {}).get("percent")
        if mem is not None and self._sustained("memory", mem >= th.ram_percent):
            await self._alert("memory", "Memória alta",
                              f"Uso de memória em {mem:.0f}%, acima do limite configurado ({th.ram_percent}%).")
        cpu = (d.get("cpu") or {}).get("percent")
        if cpu is not None and self._sustained("cpu", cpu >= th.cpu_percent):
            await self._alert("cpu", "CPU alta", f"CPU em {cpu:.0f}% há mais de 2 minutos.")
        free = (d.get("disk") or {}).get("freeGb")
        if free is not None and free < th.disk_free_gb:
            await self._alert("disk", "Pouco espaço em disco", f"Restam {free:.1f} GB livres.")
        bat = d.get("battery")
        if bat and bat.get("percent") is not None and not bat.get("plugged") and bat["percent"] <= th.battery_percent:
            await self._alert("battery", "Bateria baixa", f"Bateria em {bat['percent']:.0f}%. Conecte o carregador.")

    async def _on_reminder(self, ev: Event) -> None:
        d = ev.data
        body = d.get("text", "")
        title = "Lembrete" + (" (atrasado)" if d.get("late") else "")
        await self.notify(title, body, kind="reminder", desktop=True, speak=True, source="reminders")

    async def _on_task(self, ev: Event) -> None:
        d = ev.data
        if d.get("status") not in ("completed", "failed"):
            return
        took = (d.get("updatedAt") or 0) - (d.get("createdAt") or 0)
        if took < 20 or self.focus_mode or not self.s.settings.system.proactive_enabled:
            return
        ok = d["status"] == "completed"
        await self.notify("Tarefa concluída" if ok else "Tarefa falhou", d.get("title", ""),
                          kind="info" if ok else "warning", desktop=True, source="tasks")

    async def _on_terminal_exit(self, ev: Event) -> None:
        d = ev.data
        if d.get("status") == "killed" or d.get("exitCode") in (0, None) or not d.get("longRunning"):
            return
        await self._alert("project", "Seu projeto apresentou erro",
                          f"{d.get('label')} terminou com código {d.get('exitCode')}. Diga 'mostre os erros'.")

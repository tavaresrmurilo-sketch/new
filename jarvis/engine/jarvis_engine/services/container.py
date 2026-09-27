"""Service container: builds, wires, starts and stops every engine module."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..activity import ActivityLog, Category
from ..config import VERSION, EngineConfig
from ..db import Database
from ..eventbus import EventBus
from ..platform.base import PlatformAdapter, get_platform
from ..settings import SettingsManager


@dataclass
class Services:
    config: EngineConfig
    db: Database
    bus: EventBus
    activity: ActivityLog
    settings: SettingsManager
    platform: PlatformAdapter
    hub: Any
    permissions: Any
    registry: Any
    context: Any
    executor: Any
    tasks: Any
    monitor: Any
    apps: Any
    files: Any
    terminal: Any
    notes: Any
    reminders: Any
    memory: Any
    history: Any
    providers: Any
    notifier: Any
    voice: Any
    core: Any
    started_at: float = 0.0


def build_services(config: EngineConfig, platform: PlatformAdapter | None = None) -> Services:
    from ..core.context import ContextManager
    from ..core.executor import ActionExecutor
    from ..core.jarvis import JarvisCore
    from ..core.permissions import PermissionManager
    from ..core.tasks import TaskManager
    from ..providers.router import ProviderRouter
    from ..tools import all_tools
    from ..tools.registry import ToolRegistry
    from ..voice.service import VoiceService
    from .app_registry import AppRegistry
    from .file_index import FileIndex
    from .history import HistoryStore
    from .hub import ClientHub
    from .memory import MemoryManager
    from .notes import NotesStore
    from .notifier import Notifier
    from .reminders import ReminderEngine
    from .system_monitor import SystemMonitor
    from .terminal import TerminalManager

    config.ensure_dirs()
    db = Database(config.db_path)
    bus = EventBus()
    activity = ActivityLog(db, bus)
    settings = SettingsManager(db, bus)
    plat = platform or get_platform()
    hub = ClientHub()
    registry = ToolRegistry()
    registry.register_all(all_tools())

    def index_roots() -> list[Path]:
        folders = plat.user_folders()
        roots = [folders[k] for k in ("desktop", "documents", "downloads", "pictures", "music", "videos") if k in folders]
        home = folders.get("home", Path.home())
        for name in ("Projects", "Projetos", "projects", "projetos", "dev", "Dev", "code", "Code", "workspace",
                     "repos", "source", "git", "GitHub", "src"):
            p = home / name
            if p.is_dir():
                roots.append(p)
        roots.extend(Path(r) for r in settings.system.file_index_roots if r)
        return roots

    s = Services(
        config=config, db=db, bus=bus, activity=activity, settings=settings, platform=plat, hub=hub,
        permissions=PermissionManager(db, bus, activity, has_client=hub.has_clients),
        registry=registry, context=ContextManager(), executor=None, tasks=TaskManager(db, bus, activity),
        monitor=SystemMonitor(bus, plat, has_clients=hub.has_clients), apps=AppRegistry(db, plat, activity),
        files=FileIndex(db, bus, activity, index_roots, lambda: settings.system.index_content),
        terminal=TerminalManager(bus, activity), notes=NotesStore(db, bus), reminders=ReminderEngine(db, bus, activity),
        memory=MemoryManager(db, bus), history=HistoryStore(db, settings), providers=ProviderRouter(settings, bus, activity),
        notifier=None, voice=None, core=None,
    )
    s.executor = ActionExecutor(s)
    s.notifier = Notifier(s)
    s.voice = VoiceService(s)
    s.core = JarvisCore(s)
    return s


async def start_services(s: Services, background: bool = True) -> None:
    s.bus.bind_loop(asyncio.get_running_loop())
    s.started_at = time.time()
    s.activity.log(Category.SYSTEM, f"Jarvis Engine {VERSION} iniciando", platform=s.platform.name,
                   tools=len(s.registry))
    s.apps.load_cached()
    s.notifier.start()
    if background:
        s.monitor.start()
        s.reminders.start()
        if s.apps.needs_refresh():
            asyncio.create_task(s.apps.refresh(), name="apps-refresh")
        s.files.start_background(lambda: s.settings.system.file_index_enabled)
        asyncio.create_task(s.voice.preload(), name="voice-preload")
        s.history.prune()
        s.activity.prune(s.settings.privacy.history_retention_days)


async def stop_services(s: Services) -> None:
    s.notifier.stop()
    await s.monitor.stop()
    await s.reminders.stop()
    await s.files.stop()
    await s.terminal.stop_all()
    s.activity.log(Category.SYSTEM, "Jarvis Engine encerrado")
    s.db.close()


async def init_checks(s: Services) -> list[dict[str, Any]]:
    """Real module checks for the SYSTEM INITIALIZATION screen. Never reports ONLINE on failure."""
    checks: list[dict[str, Any]] = []

    def add(name: str, status: str, detail: str) -> None:
        checks.append({"module": name, "status": status, "detail": detail})

    # Voice
    try:
        v = s.voice.status()
        if not s.settings.voice.enabled:
            add("Voice Engine", "offline", "Voz desativada nas configurações")
        elif v["stt"].get("available"):
            add("Voice Engine", "online", f"STT {v['stt'].get('model', '')} · TTS: {v['tts'].get('detail', '')}")
        else:
            add("Voice Engine", "degraded", v["stt"].get("detail", "Reconhecimento indisponível"))
    except Exception as exc:
        add("Voice Engine", "offline", str(exc))
    # Memory
    try:
        s.db.execute("SELECT 1")
        add("Memory", "online", f"{s.memory.count()} memórias · {s.notes.count()} notas")
    except Exception as exc:
        add("Memory", "offline", str(exc))
    # System monitor
    try:
        snap = await asyncio.to_thread(s.monitor.sample)
        add("System Monitor", "online", f"CPU {snap['cpu']['percent']:.0f}% · RAM {snap['memory']['percent']:.0f}%")
    except Exception as exc:
        add("System Monitor", "offline", str(exc))
    # AI provider
    try:
        h = await s.providers.health(force=True)
        if s.settings.ai.provider == "none":
            add("AI Provider", "degraded", "Sem provedor: somente comandos locais")
        else:
            add("AI Provider", "online" if h.ok else "offline", h.detail)
    except Exception as exc:
        add("AI Provider", "offline", str(exc))
    # Tool registry
    try:
        tools = s.registry.available()
        for t in tools:
            t.json_schema()
        add("Tool Registry", "online" if tools else "offline", f"{len(tools)} ferramentas disponíveis")
    except Exception as exc:
        add("Tool Registry", "offline", str(exc))
    # File index / apps
    st = s.files.status
    add("File Intelligence", "online" if st.state in ("idle", "indexing") and st.state != "error" else "degraded",
        f"{st.files} itens indexados" + (" (indexando…)" if st.state == "indexing" else ""))
    add("App Registry", "online" if len(s.apps.entries) > 0 else "degraded",
        f"{len(s.apps.entries)} aplicativos" + (" (atualizando…)" if s.apps.refreshing else ""))
    return checks

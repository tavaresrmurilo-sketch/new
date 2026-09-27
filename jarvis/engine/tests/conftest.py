from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

import pytest

from jarvis_engine.config import EngineConfig
from jarvis_engine.eventbus import Event
from jarvis_engine.platform.base import AppEntry, PlatformAdapter, WindowInfo


class FakePlatform(PlatformAdapter):
    """In-memory OS adapter: records every side effect so tests can assert on it."""

    name = "fake"

    def __init__(self, home: Path) -> None:
        self.home = home
        self.opened: list[str] = []
        self.launched: list[str] = []
        self.closed: list[int] = []
        self.volume = 50.0
        self.muted = False
        self.app_volumes: dict[str, float] = {"spotify.exe": 80.0}
        self.media: list[str] = []
        self.locked = False
        self.window = WindowInfo(1, "Documento - Bloco de Notas", "notepad.exe", 4242)
        self.window_states: list[tuple[int, str]] = []

    def open_path(self, path: Path) -> None:
        self.opened.append(str(path))

    def open_uri(self, uri: str) -> None:
        self.opened.append(uri)

    def launch_app(self, entry: AppEntry) -> None:
        self.launched.append(entry.name)

    def scan_apps(self) -> list[AppEntry]:
        return [
            AppEntry("Spotify", "SpotifyAB.SpotifyMusic!Spotify", "uwp", "spotify.exe", "test"),
            AppEntry("Google Chrome", "C:/chrome.lnk", "lnk", "chrome.exe", "test"),
            AppEntry("Visual Studio Code", "C:/code.lnk", "lnk", "code.exe", "test"),
            AppEntry("Calculadora", "calc.exe", "builtin", "calculatorapp.exe", "test", ["calculator"]),
        ]

    def builtin_apps(self) -> list[AppEntry]:
        return [AppEntry("Explorador de Arquivos", "explorer.exe", "builtin", "explorer.exe", "builtin",
                         ["explorador", "arquivos"])]

    def active_window(self) -> WindowInfo | None:
        return self.window

    def list_windows(self) -> list[WindowInfo]:
        return [self.window, WindowInfo(2, "Spotify Premium", "spotify.exe", 999)]

    def focus_window(self, handle: int) -> bool:
        return True

    def set_window_state(self, handle: int, state: str) -> bool:
        self.window_states.append((handle, state))
        return True

    def close_process_gracefully(self, pid: int) -> None:
        self.closed.append(pid)

    def get_master_volume(self) -> float | None:
        return self.volume

    def set_master_volume(self, percent: float) -> None:
        self.volume = percent

    def get_mute(self) -> bool | None:
        return self.muted

    def set_mute(self, muted: bool) -> None:
        self.muted = muted

    def set_app_volume(self, process_names: list[str], percent: float | None = None,
                       delta: float | None = None) -> list[dict[str, Any]]:
        changed = []
        for name in process_names:
            if name.lower() in self.app_volumes:
                cur = self.app_volumes[name.lower()]
                new = percent if percent is not None else max(0.0, min(100.0, cur + (delta or 0)))
                self.app_volumes[name.lower()] = new
                changed.append({"process": name, "pid": 999, "from": round(cur), "to": round(new)})
        return changed

    def media_key(self, action: str) -> None:
        self.media.append(action)

    def lock(self) -> None:
        self.locked = True

    def settings_uri(self, page: str) -> str | None:
        return f"ms-settings:{page}"

    def user_folders(self) -> dict[str, Path]:
        out = {"home": self.home}
        for key, name in (("desktop", "Desktop"), ("documents", "Documents"), ("downloads", "Downloads")):
            out[key] = self.home / name
        return out

    def vscode_command(self) -> list[str] | None:
        return None

    def gpu_metrics(self) -> dict[str, Any] | None:
        return None


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    h = tmp_path / "home"
    for d in ("Desktop", "Documents", "Downloads", "Projects/projeto-beta", "Projects/site-alpha"):
        (h / d).mkdir(parents=True)
    (h / "Documents" / "apresentacao-escola.md").write_text("Apresentação da escola sobre fotossíntese", "utf-8")
    (h / "Documents" / "relatorio-q3.txt").write_text("Relatório financeiro Q3", "utf-8")
    (h / "Downloads" / "contrato-beta.txt").write_text("Contrato de aluguel BETA", "utf-8")
    (h / "Projects" / "projeto-beta" / "package.json").write_text(
        '{"name":"projeto-beta","scripts":{"dev":"node server.js","test":"node test.js"}}', "utf-8")
    (h / "Projects" / "site-alpha" / "package.json").write_text('{"name":"site-alpha","scripts":{"build":"x"}}',
                                                                  "utf-8")
    monkeypatch.setenv("HOME", str(h))
    monkeypatch.setenv("USERPROFILE", str(h))
    for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    return h


@pytest.fixture
def config(tmp_path: Path) -> EngineConfig:
    return EngineConfig(data_dir=tmp_path / "data", port=0, token="test-token")


@pytest.fixture
def platform(home: Path) -> FakePlatform:
    return FakePlatform(home)


class Recorder:
    def __init__(self) -> None:
        self.events: list[Event] = []

    def __call__(self, ev: Event) -> None:
        self.events.append(ev)

    def named(self, name: str) -> list[dict[str, Any]]:
        return [e.data for e in self.events if e.name == name]

    def responses(self) -> list[str]:
        return [d["text"] for d in self.named("ai.response")]


@pytest.fixture
async def services(config: EngineConfig, platform: FakePlatform):
    from jarvis_engine.services.container import build_services, start_services, stop_services

    s = build_services(config, platform=platform)
    await start_services(s, background=False)
    await s.apps.refresh()
    await asyncio.to_thread(s.files.scan)
    # Tests act as a connected UI that auto-approves unless told otherwise.
    s.permissions.has_client = lambda: True
    yield s
    await stop_services(s)


@pytest.fixture
def recorder(services) -> Recorder:
    r = Recorder()
    services.bus.subscribe("*", r)
    return r


def approve_all(services, approved: bool = True) -> None:
    """Auto-answer every permission request."""

    def on_request(ev: Event) -> None:
        asyncio.get_event_loop().call_soon(services.permissions.respond, ev.data["id"], approved)

    services.bus.subscribe("permission.request", on_request)


os.environ.setdefault("JARVIS_TEST", "1")

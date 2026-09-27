"""Operating-system adapter contract.

Tools never call OS APIs directly; they go through a PlatformAdapter so the
Windows implementation (primary target) and the Linux implementation (used for
development and CI) stay interchangeable. Unsupported operations raise
`Unsupported` with a user-facing message instead of pretending to work.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


class Unsupported(RuntimeError):
    pass


@dataclass
class AppEntry:
    name: str
    launch: str
    kind: str  # lnk | uwp | exe | desktop | uri | builtin
    exe_name: str = ""
    source: str = ""
    aliases: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class WindowInfo:
    handle: int
    title: str
    process: str
    pid: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


MEDIA_ACTIONS = ("play_pause", "next", "previous", "stop")

SETTINGS_PAGES = (
    "home", "display", "sound", "bluetooth", "network", "wifi", "notifications", "focus", "power",
    "storage", "apps", "default_apps", "privacy", "microphone", "camera", "update", "personalization",
    "background", "mouse", "keyboard", "language", "time", "accounts",
)


def which(cmd: str) -> str | None:
    return shutil.which(cmd)


def _no_window_flags() -> int:
    if sys.platform == "win32":
        return 0x08000000  # CREATE_NO_WINDOW
    return 0


def run_quiet(argv: list[str], timeout: float = 15.0, input_text: str | None = None) -> subprocess.CompletedProcess[str]:
    """Run a helper process without a console window, capturing UTF-8 output."""
    return subprocess.run(
        argv,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        input=input_text,
        creationflags=_no_window_flags(),
    )


# cmd.exe re-parses the arguments of .cmd/.bat launchers (e.g. VS Code's code.cmd), so a
# path like "demo&calc" would run a second command.
CMD_UNSAFE = re.compile(r'[&|<>^%"!]')


def spawn_detached(argv: list[str], cwd: str | None = None) -> None:
    if sys.platform == "win32" and argv and argv[0].lower().endswith((".cmd", ".bat")) \
            and any(CMD_UNSAFE.search(a) for a in argv[1:]):
        raise ValueError("Esse caminho tem caracteres que não posso repassar com segurança a esse programa.")
    kwargs: dict[str, Any] = {"cwd": cwd, "stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL,
                              "stderr": subprocess.DEVNULL}
    if sys.platform == "win32":
        kwargs["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    subprocess.Popen(argv, **kwargs)  # noqa: S603 - argv list, never a shell string


class PlatformAdapter(ABC):
    name = "generic"

    # -- shell / launching ------------------------------------------------
    @abstractmethod
    def open_path(self, path: Path) -> None: ...

    @abstractmethod
    def open_uri(self, uri: str) -> None: ...

    @abstractmethod
    def launch_app(self, entry: AppEntry) -> None: ...

    @abstractmethod
    def scan_apps(self) -> list[AppEntry]: ...

    def builtin_apps(self) -> list[AppEntry]:
        return []

    def vscode_command(self) -> list[str] | None:
        code = which("code") or which("code-insiders") or which("codium")
        return [code] if code else None

    def reveal_in_file_manager(self, path: Path) -> None:
        self.open_path(path if path.is_dir() else path.parent)

    # -- windows / processes ---------------------------------------------
    def active_window(self) -> WindowInfo | None:
        return None

    def list_windows(self) -> list[WindowInfo]:
        raise Unsupported("Listar janelas não é suportado neste sistema.")

    def focus_window(self, handle: int) -> bool:
        raise Unsupported("Focar janelas não é suportado neste sistema.")

    def set_window_state(self, handle: int, state: str) -> bool:
        raise Unsupported("Minimizar/maximizar janelas não é suportado neste sistema.")

    @abstractmethod
    def close_process_gracefully(self, pid: int) -> None: ...

    # -- audio -------------------------------------------------------------
    def get_master_volume(self) -> float | None:
        return None

    def set_master_volume(self, percent: float) -> None:
        raise Unsupported("Controle de volume indisponível neste sistema.")

    def get_mute(self) -> bool | None:
        return None

    def set_mute(self, muted: bool) -> None:
        raise Unsupported("Controle de mudo indisponível neste sistema.")

    def list_audio_sessions(self) -> list[dict[str, Any]]:
        return []

    def set_app_volume(self, process_names: list[str], percent: float | None = None,
                       delta: float | None = None) -> list[dict[str, Any]]:
        raise Unsupported("Volume por aplicativo indisponível neste sistema.")

    def media_key(self, action: str) -> None:
        raise Unsupported("Teclas de mídia indisponíveis neste sistema.")

    # -- power -------------------------------------------------------------
    def lock(self) -> None:
        raise Unsupported("Bloqueio de tela indisponível neste sistema.")

    def sleep(self) -> None:
        raise Unsupported("Suspensão indisponível neste sistema.")

    def shutdown(self, restart: bool, delay_s: int) -> None:
        raise Unsupported("Desligamento indisponível neste sistema.")

    def cancel_shutdown(self) -> None:
        raise Unsupported("Cancelamento de desligamento indisponível neste sistema.")

    # -- misc ----------------------------------------------------------------
    def settings_uri(self, page: str) -> str | None:
        return None

    def clipboard_get(self) -> str | None:
        return None

    def clipboard_set(self, text: str) -> bool:
        return False

    def user_folders(self) -> dict[str, Path]:
        home = Path.home()
        names = {"desktop": "Desktop", "documents": "Documents", "downloads": "Downloads",
                 "pictures": "Pictures", "music": "Music", "videos": "Videos"}
        out = {"home": home}
        for key, folder in names.items():
            p = home / folder
            if p.exists():
                out[key] = p
        return out

    def gpu_metrics(self) -> dict[str, Any] | None:
        smi = which("nvidia-smi")
        if not smi:
            return None
        try:
            res = run_quiet([smi, "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                             "--format=csv,noheader,nounits"], timeout=5)
        except (OSError, subprocess.TimeoutExpired):
            return None
        if res.returncode != 0 or not res.stdout.strip():
            return None
        parts = [p.strip() for p in res.stdout.strip().splitlines()[0].split(",")]
        try:
            return {
                "name": parts[0],
                "percent": float(parts[1]),
                "memoryUsedMb": float(parts[2]),
                "memoryTotalMb": float(parts[3]),
                "temperatureC": float(parts[4]) if parts[4] not in ("", "[N/A]") else None,
                "source": "nvidia-smi",
            }
        except (IndexError, ValueError):
            return None


def get_platform() -> PlatformAdapter:
    if sys.platform == "win32":
        from .windows import WindowsAdapter

        adapter: PlatformAdapter = WindowsAdapter()
    else:
        from .posix import PosixAdapter

        adapter = PosixAdapter()
    sandbox_log = os.environ.get("JARVIS_SANDBOX_LOG")
    if sandbox_log:
        return RecordingAdapter(adapter, sandbox_log)
    return adapter


def env_path(name: str) -> Path | None:
    value = os.environ.get(name)
    return Path(value) if value else None


class RecordingAdapter(PlatformAdapter):
    """Test/demo sandbox (JARVIS_SANDBOX_LOG=<file>): delegates reads to the real adapter but only
    *records* side effects (opening, launching, closing, volume, power) as JSON lines."""

    def __init__(self, inner: PlatformAdapter, log_file: str) -> None:
        self.inner = inner
        self.name = f"{inner.name}-sandbox"
        self.log_file = log_file
        self.volume = 50.0
        self.muted = False

    def _record(self, action: str, **data: Any) -> None:
        import json
        import time

        with open(self.log_file, "a", encoding="utf-8") as fh:
            fh.write(json.dumps({"ts": time.time(), "action": action, **data}, ensure_ascii=False) + "\n")

    def open_path(self, path: Path) -> None:
        self._record("open_path", path=str(path))

    def open_uri(self, uri: str) -> None:
        self._record("open_uri", uri=uri)

    def launch_app(self, entry: AppEntry) -> None:
        self._record("launch_app", name=entry.name)

    def scan_apps(self) -> list[AppEntry]:
        return self.inner.scan_apps()

    def builtin_apps(self) -> list[AppEntry]:
        return self.inner.builtin_apps() + [AppEntry("Google Chrome", "chrome", "exe", "chrome.exe", "sandbox",
                                                     ["chrome", "navegador do google"]),
                                            AppEntry("Spotify", "spotify", "exe", "spotify.exe", "sandbox")]

    def vscode_command(self) -> list[str] | None:
        return self.inner.vscode_command()

    def active_window(self) -> WindowInfo | None:
        return self.inner.active_window()

    def close_process_gracefully(self, pid: int) -> None:
        self._record("close_process", pid=pid)

    def get_master_volume(self) -> float | None:
        return self.volume

    def set_master_volume(self, percent: float) -> None:
        self.volume = percent
        self._record("set_volume", percent=percent)

    def get_mute(self) -> bool | None:
        return self.muted

    def set_mute(self, muted: bool) -> None:
        self.muted = muted
        self._record("set_mute", muted=muted)

    def media_key(self, action: str) -> None:
        self._record("media_key", key=action)

    def lock(self) -> None:
        self._record("lock")

    def sleep(self) -> None:
        self._record("sleep")

    def shutdown(self, restart: bool, delay_s: int) -> None:
        self._record("shutdown", restart=restart, delay=delay_s)

    def cancel_shutdown(self) -> None:
        self._record("cancel_shutdown")

    def settings_uri(self, page: str) -> str | None:
        return self.inner.settings_uri(page) or f"ms-settings:{page}"

    def user_folders(self) -> dict[str, Path]:
        # Hermetic: HOME/USERPROFILE-based folders, never the real Windows Known Folders.
        return PlatformAdapter.user_folders(self)

    def gpu_metrics(self) -> dict[str, Any] | None:
        return self.inner.gpu_metrics()

    def clipboard_get(self) -> str | None:
        return self.inner.clipboard_get()

    def clipboard_set(self, text: str) -> bool:
        self._record("clipboard_set", length=len(text))
        return True

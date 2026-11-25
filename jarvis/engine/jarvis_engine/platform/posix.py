"""Linux/macOS adapter. Used for development and CI; Windows is the primary target."""

from __future__ import annotations

import configparser
import os
import re
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any

from .base import AppEntry, PlatformAdapter, Unsupported, WindowInfo, run_quiet, spawn_detached, which

_FIELD_CODES = re.compile(r"%[fFuUdDnNickvm]")


class PosixAdapter(PlatformAdapter):
    name = "macos" if sys.platform == "darwin" else "linux"

    def _opener(self) -> str:
        opener = "open" if sys.platform == "darwin" else (which("xdg-open") or which("gio"))
        if not opener:
            raise Unsupported("Nenhum abridor de arquivos (xdg-open) encontrado.")
        return opener

    def open_path(self, path: Path) -> None:
        opener = self._opener()
        argv = [opener, "open", str(path)] if opener.endswith("gio") else [opener, str(path)]
        spawn_detached(argv)

    def open_uri(self, uri: str) -> None:
        opener = self._opener()
        argv = [opener, "open", uri] if opener.endswith("gio") else [opener, uri]
        spawn_detached(argv)

    def launch_app(self, entry: AppEntry) -> None:
        if entry.kind == "desktop":
            import shlex

            argv = [a for a in shlex.split(_FIELD_CODES.sub("", entry.launch)) if a]
            if not argv:
                raise Unsupported(f"Não sei como iniciar {entry.name}.")
            spawn_detached(argv)
        elif entry.kind == "uri":
            self.open_uri(entry.launch)
        else:
            spawn_detached([entry.launch])

    def _desktop_dirs(self) -> list[Path]:
        dirs = [Path("/usr/share/applications"), Path("/usr/local/share/applications"),
                Path.home() / ".local/share/applications", Path("/var/lib/flatpak/exports/share/applications"),
                Path.home() / ".local/share/flatpak/exports/share/applications", Path("/var/lib/snapd/desktop/applications")]
        return [d for d in dirs if d.is_dir()]

    def scan_apps(self) -> list[AppEntry]:
        out: list[AppEntry] = []
        for d in self._desktop_dirs():
            for f in d.glob("*.desktop"):
                cp = configparser.ConfigParser(interpolation=None, strict=False)
                try:
                    cp.read(f, encoding="utf-8")
                except (configparser.Error, UnicodeDecodeError, OSError):
                    continue
                if "Desktop Entry" not in cp:
                    continue
                e = cp["Desktop Entry"]
                if e.get("NoDisplay", "false").lower() == "true" or e.get("Type", "Application") != "Application":
                    continue
                name = e.get("Name", "").strip()
                exec_line = e.get("Exec", "").strip()
                if not name or not exec_line:
                    continue
                exe = Path(exec_line.split()[0]).name.lower()
                aliases = [a.strip() for a in e.get("Keywords", "").split(";") if a.strip()][:8]
                generic = e.get("GenericName", "").strip()
                if generic:
                    aliases.append(generic)
                out.append(AppEntry(name, exec_line, "desktop", exe, str(f), aliases))
        return out

    def builtin_apps(self) -> list[AppEntry]:
        apps: list[AppEntry] = []
        for name, cmd, aliases in (
            ("Terminal", "x-terminal-emulator", ["terminal", "console"]),
            ("Gerenciador de Arquivos", "nautilus", ["explorador de arquivos", "arquivos", "file explorer"]),
        ):
            path = which(cmd)
            if path:
                apps.append(AppEntry(name, path, "exe", Path(path).name, "builtin", aliases))
        return apps

    def active_window(self) -> WindowInfo | None:
        xdotool = which("xdotool")
        if not xdotool or not os.environ.get("DISPLAY"):
            return None
        try:
            wid = run_quiet([xdotool, "getactivewindow"], timeout=2).stdout.strip()
            if not wid:
                return None
            title = run_quiet([xdotool, "getwindowname", wid], timeout=2).stdout.strip()
            pid_s = run_quiet([xdotool, "getwindowpid", wid], timeout=2).stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            return None
        pid = int(pid_s) if pid_s.isdigit() else 0
        pname = ""
        if pid:
            try:
                import psutil

                pname = psutil.Process(pid).name()
            except Exception:
                pname = ""
        return WindowInfo(int(wid), title, pname, pid)

    def close_process_gracefully(self, pid: int) -> None:
        os.kill(pid, signal.SIGTERM)

    # -- audio via PulseAudio/PipeWire (pactl) ------------------------------
    def _pactl(self) -> str:
        p = which("pactl")
        if not p:
            raise Unsupported("Controle de volume requer 'pactl' (PulseAudio/PipeWire).")
        return p

    def get_master_volume(self) -> float | None:
        try:
            out = run_quiet([self._pactl(), "get-sink-volume", "@DEFAULT_SINK@"], timeout=3).stdout
        except (Unsupported, OSError, subprocess.TimeoutExpired):
            return None
        m = re.search(r"(\d+)%", out)
        return float(m.group(1)) if m else None

    def set_master_volume(self, percent: float) -> None:
        pct = int(max(0, min(100, percent)))
        res = run_quiet([self._pactl(), "set-sink-volume", "@DEFAULT_SINK@", f"{pct}%"], timeout=3)
        if res.returncode != 0:
            raise Unsupported(res.stderr.strip() or "Falha ao ajustar o volume.")

    def get_mute(self) -> bool | None:
        try:
            out = run_quiet([self._pactl(), "get-sink-mute", "@DEFAULT_SINK@"], timeout=3).stdout
        except (Unsupported, OSError, subprocess.TimeoutExpired):
            return None
        return "yes" in out.lower() if out else None

    def set_mute(self, muted: bool) -> None:
        res = run_quiet([self._pactl(), "set-sink-mute", "@DEFAULT_SINK@", "1" if muted else "0"], timeout=3)
        if res.returncode != 0:
            raise Unsupported(res.stderr.strip() or "Falha ao alternar o mudo.")

    def media_key(self, action: str) -> None:
        playerctl = which("playerctl")
        if not playerctl:
            raise Unsupported("Controle de mídia requer 'playerctl'.")
        cmd = {"play_pause": "play-pause", "next": "next", "previous": "previous", "stop": "stop"}.get(action)
        if not cmd:
            raise Unsupported(f"Ação de mídia desconhecida: {action}")
        run_quiet([playerctl, cmd], timeout=3)

    def lock(self) -> None:
        loginctl = which("loginctl")
        if not loginctl:
            raise Unsupported("Bloqueio requer 'loginctl'.")
        run_quiet([loginctl, "lock-session"], timeout=5)

    def sleep(self) -> None:
        systemctl = which("systemctl")
        if not systemctl:
            raise Unsupported("Suspensão requer 'systemctl'.")
        run_quiet([systemctl, "suspend"], timeout=5)

    def shutdown(self, restart: bool, delay_s: int) -> None:
        minutes = max(1, round(delay_s / 60))
        run_quiet(["shutdown", "-r" if restart else "-h", f"+{minutes}"], timeout=5)

    def cancel_shutdown(self) -> None:
        run_quiet(["shutdown", "-c"], timeout=5)

    def clipboard_get(self) -> str | None:
        for argv in (["wl-paste", "-n"], ["xclip", "-selection", "clipboard", "-o"], ["pbpaste"]):
            if which(argv[0]):
                try:
                    res = run_quiet(argv, timeout=3)
                except (OSError, subprocess.TimeoutExpired):
                    continue
                if res.returncode == 0:
                    return res.stdout
        return None

    def clipboard_set(self, text: str) -> bool:
        for argv in (["wl-copy"], ["xclip", "-selection", "clipboard"], ["pbcopy"]):
            if which(argv[0]):
                try:
                    res = run_quiet(argv, timeout=3, input_text=text)
                except (OSError, subprocess.TimeoutExpired):
                    continue
                if res.returncode == 0:
                    return True
        return False

    def user_folders(self) -> dict[str, Path]:
        out = super().user_folders()
        cfg = Path.home() / ".config" / "user-dirs.dirs"
        if cfg.is_file():
            mapping = {"XDG_DESKTOP_DIR": "desktop", "XDG_DOCUMENTS_DIR": "documents",
                       "XDG_DOWNLOAD_DIR": "downloads", "XDG_PICTURES_DIR": "pictures",
                       "XDG_MUSIC_DIR": "music", "XDG_VIDEOS_DIR": "videos"}
            for line in cfg.read_text(encoding="utf-8", errors="ignore").splitlines():
                key, _, value = line.partition("=")
                if key in mapping:
                    p = Path(value.strip().strip('"').replace("$HOME", str(Path.home())))
                    if p.exists():
                        out[mapping[key]] = p
        return out

    def settings_uri(self, page: str) -> str | None:
        return None

    def list_audio_sessions(self) -> list[dict[str, Any]]:
        return []

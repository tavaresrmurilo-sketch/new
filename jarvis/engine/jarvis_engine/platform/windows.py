"""Windows 10/11 adapter: Shell, Win32 (ctypes), Core Audio (pycaw) and PowerShell.

COM objects are only touched from one dedicated worker thread (`_com`), which
calls CoInitialize once; this avoids apartment errors when tools run in the
asyncio thread pool.
"""

from __future__ import annotations

import concurrent.futures
import ctypes
import json
import os
import re
import subprocess
import threading
import time
from ctypes import wintypes
from pathlib import Path
from typing import Any, Callable, TypeVar

from .base import (
    AppEntry,
    PlatformAdapter,
    Unsupported,
    WindowInfo,
    run_quiet,
    spawn_detached,
    which,
)

T = TypeVar("T")

_SETTINGS_URIS = {
    "home": "ms-settings:",
    "display": "ms-settings:display",
    "sound": "ms-settings:sound",
    "bluetooth": "ms-settings:bluetooth",
    "network": "ms-settings:network-status",
    "wifi": "ms-settings:network-wifi",
    "notifications": "ms-settings:notifications",
    "focus": "ms-settings:quiethours",
    "power": "ms-settings:powersleep",
    "storage": "ms-settings:storagesense",
    "apps": "ms-settings:appsfeatures",
    "default_apps": "ms-settings:defaultapps",
    "privacy": "ms-settings:privacy",
    "microphone": "ms-settings:privacy-microphone",
    "camera": "ms-settings:privacy-webcam",
    "update": "ms-settings:windowsupdate",
    "personalization": "ms-settings:personalization",
    "background": "ms-settings:personalization-background",
    "mouse": "ms-settings:mousetouchpad",
    "keyboard": "ms-settings:keyboard",
    "language": "ms-settings:regionlanguage",
    "time": "ms-settings:dateandtime",
    "accounts": "ms-settings:yourinfo",
}

_KNOWN_FOLDERS = {
    "desktop": "{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}",
    "documents": "{FDD39AD0-238F-46AF-ADB4-6C85480369C7}",
    "downloads": "{374DE290-123F-4565-9164-39C4925E467B}",
    "pictures": "{33E28130-4E1E-4676-835A-98395C3BC3BB}",
    "music": "{4BD8D571-6D19-48D3-BE97-422220080E43}",
    "videos": "{18989B1D-99B5-455B-841C-AB7C74E4DDFC}",
}

_VK = {"play_pause": 0xB3, "next": 0xB0, "previous": 0xB1, "stop": 0xB2,
       "vol_mute": 0xAD, "vol_down": 0xAE, "vol_up": 0xAF, "menu": 0x12}
KEYEVENTF_KEYUP = 0x0002

_SCAN_SCRIPT = r"""
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'
$sh = New-Object -ComObject WScript.Shell
$dirs = @(
  "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
  "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
  [Environment]::GetFolderPath('Desktop'),
  "$env:PUBLIC\Desktop"
)
$lnk = foreach ($d in $dirs) {
  if (Test-Path -LiteralPath $d) {
    Get-ChildItem -LiteralPath $d -Recurse -Filter *.lnk | ForEach-Object {
      $s = $sh.CreateShortcut($_.FullName)
      [pscustomobject]@{ name = $_.BaseName; path = $_.FullName; target = $s.TargetPath }
    }
  }
}
$start = @(Get-StartApps | Select-Object Name, AppID)
[pscustomobject]@{ lnk = @($lnk); start = $start } | ConvertTo-Json -Depth 4 -Compress
"""

_SKIP_WORDS = re.compile(
    r"uninstall|desinstal|readme|leia-me|help|ajuda|documentation|documenta|website|site da web|release notes|"
    r"license|licen[çc]a|changelog|manual|support|suporte",
    re.IGNORECASE,
)
_SKIP_TARGET_EXT = (".url", ".html", ".htm", ".txt", ".pdf", ".chm", ".rtf", ".ini", ".log")


class _ComThread:
    """Single worker thread with COM initialised (STA) for Core Audio calls."""

    def __init__(self) -> None:
        self._pool = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="jarvis-com",
                                                           initializer=self._init)
        self.available = True

    @staticmethod
    def _init() -> None:
        try:
            import comtypes  # type: ignore[import-not-found]

            comtypes.CoInitialize()
        except Exception:
            pass

    def call(self, fn: Callable[[], T], timeout: float = 5.0) -> T:
        return self._pool.submit(fn).result(timeout=timeout)


class WindowsAdapter(PlatformAdapter):
    name = "windows"

    def __init__(self) -> None:
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self._com = _ComThread()
        self._gpu_cache: tuple[float, dict[str, Any] | None] = (0.0, None)
        self._gpu_lock = threading.Lock()
        self._setup_prototypes()

    def _setup_prototypes(self) -> None:
        u = self.user32
        u.GetForegroundWindow.restype = wintypes.HWND
        u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
        u.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
        u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
        u.GetWindowThreadProcessId.restype = wintypes.DWORD
        u.IsWindowVisible.argtypes = [wintypes.HWND]
        u.IsIconic.argtypes = [wintypes.HWND]
        u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
        u.SetForegroundWindow.argtypes = [wintypes.HWND]
        u.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
        u.GetWindowLongW.restype = ctypes.c_long
        u.keybd_event.argtypes = [wintypes.BYTE, wintypes.BYTE, wintypes.DWORD, ctypes.c_size_t]
        u.LockWorkStation.restype = wintypes.BOOL

    # ------------------------------------------------------------ launching
    def open_path(self, path: Path) -> None:
        os.startfile(str(path))  # type: ignore[attr-defined]

    def open_uri(self, uri: str) -> None:
        os.startfile(uri)  # type: ignore[attr-defined]

    def launch_app(self, entry: AppEntry) -> None:
        if entry.kind in ("lnk", "uri"):
            os.startfile(entry.launch)  # type: ignore[attr-defined]
        elif entry.kind == "uwp":
            spawn_detached(["explorer.exe", f"shell:AppsFolder\\{entry.launch}"])
        elif entry.kind in ("exe", "builtin"):
            target = entry.launch
            if os.path.isabs(target):
                spawn_detached([target], cwd=str(Path(target).parent))
            else:
                resolved = which(target) or target
                spawn_detached([resolved])
        else:
            os.startfile(entry.launch)  # type: ignore[attr-defined]

    def builtin_apps(self) -> list[AppEntry]:
        sysroot = Path(os.environ.get("SystemRoot", r"C:\Windows"))
        s32 = sysroot / "System32"
        apps = [
            AppEntry("Explorador de Arquivos", "explorer.exe", "builtin", "explorer.exe", "builtin",
                     ["explorer", "explorador", "gerenciador de arquivos", "file explorer", "arquivos"]),
            AppEntry("Configurações", "ms-settings:", "uri", "systemsettings.exe", "builtin",
                     ["settings", "configuracoes", "configurações do windows", "ajustes"]),
            AppEntry("Bloco de Notas", str(s32 / "notepad.exe") if (s32 / "notepad.exe").exists() else "notepad.exe",
                     "builtin", "notepad.exe", "builtin", ["notepad", "bloco de notas"]),
            AppEntry("Calculadora", "calc.exe", "builtin", "calculatorapp.exe", "builtin", ["calculator", "calc"]),
            AppEntry("Gerenciador de Tarefas", "taskmgr.exe", "builtin", "taskmgr.exe", "builtin",
                     ["task manager", "taskmgr", "gerenciador de tarefas"]),
            AppEntry("Paint", "mspaint.exe", "builtin", "mspaint.exe", "builtin", ["mspaint"]),
            AppEntry("Painel de Controle", "control.exe", "builtin", "control.exe", "builtin",
                     ["control panel", "painel de controle"]),
            AppEntry("Prompt de Comando", "cmd.exe", "builtin", "cmd.exe", "builtin", ["cmd", "prompt"]),
        ]
        wt = which("wt.exe") or which("wt")
        if wt:
            apps.append(AppEntry("Terminal", wt, "exe", "windowsterminal.exe", "builtin",
                                 ["windows terminal", "terminal"]))
        else:
            apps.append(AppEntry("PowerShell", "powershell.exe", "builtin", "powershell.exe", "builtin",
                                 ["terminal", "powershell"]))
        return apps

    def vscode_command(self) -> list[str] | None:
        code = which("code.cmd") or which("code")
        if code:
            return [code]
        local = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Microsoft VS Code" / "Code.exe"
        for candidate in (local, Path(os.environ.get("ProgramFiles", "")) / "Microsoft VS Code" / "Code.exe"):
            if candidate.exists():
                return [str(candidate)]
        return None

    def scan_apps(self) -> list[AppEntry]:
        entries: list[AppEntry] = []
        entries.extend(self._scan_shortcuts_and_start_apps())
        entries.extend(self._scan_app_paths())
        entries.extend(self._scan_program_dirs())
        return entries

    def _scan_shortcuts_and_start_apps(self) -> list[AppEntry]:
        try:
            res = run_quiet(["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                             "-Command", _SCAN_SCRIPT], timeout=60)
        except (OSError, subprocess.TimeoutExpired):
            return []
        if res.returncode != 0 or not res.stdout.strip():
            return []
        try:
            payload = json.loads(res.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            return []
        out: list[AppEntry] = []
        lnk_items = payload.get("lnk") or []
        if isinstance(lnk_items, dict):
            lnk_items = [lnk_items]
        for item in lnk_items:
            name = str(item.get("name") or "").strip()
            target = str(item.get("target") or "")
            if not name or _SKIP_WORDS.search(name) or target.lower().endswith(_SKIP_TARGET_EXT):
                continue
            exe = Path(target).name.lower() if target.lower().endswith(".exe") else ""
            out.append(AppEntry(name, str(item.get("path")), "lnk", exe, "start-menu"))
        start_items = payload.get("start") or []
        if isinstance(start_items, dict):
            start_items = [start_items]
        for item in start_items:
            name = str(item.get("Name") or "").strip()
            app_id = str(item.get("AppID") or "").strip()
            if not name or not app_id or _SKIP_WORDS.search(name):
                continue
            exe = Path(app_id).name.lower() if app_id.lower().endswith(".exe") else ""
            out.append(AppEntry(name, app_id, "uwp", exe, "start-apps"))
        return out

    def _scan_app_paths(self) -> list[AppEntry]:
        import winreg  # type: ignore[import-not-found]

        out: list[AppEntry] = []
        key_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths"
        for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            try:
                with winreg.OpenKey(hive, key_path) as root:
                    i = 0
                    while True:
                        try:
                            sub = winreg.EnumKey(root, i)
                        except OSError:
                            break
                        i += 1
                        try:
                            with winreg.OpenKey(root, sub) as k:
                                value, _ = winreg.QueryValueEx(k, "")
                        except OSError:
                            continue
                        exe_path = str(value).strip().strip('"')
                        if exe_path.lower().endswith(".exe") and os.path.exists(exe_path):
                            out.append(AppEntry(Path(sub).stem, exe_path, "exe", sub.lower(), "app-paths"))
            except OSError:
                continue
        return out

    def _scan_program_dirs(self) -> list[AppEntry]:
        roots = [os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"),
                 str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs")]
        out: list[AppEntry] = []
        for root in filter(None, roots):
            base = Path(root)
            if not base.is_dir():
                continue
            try:
                vendors = list(base.iterdir())[:400]
            except OSError:
                continue
            for vendor in vendors:
                if not vendor.is_dir():
                    continue
                candidates: list[Path] = []
                try:
                    candidates.extend(p for p in vendor.glob("*.exe"))
                    for sub in list(vendor.iterdir())[:30]:
                        if sub.is_dir():
                            candidates.extend(sub.glob("*.exe"))
                except OSError:
                    continue
                key = re.sub(r"[^a-z0-9]", "", vendor.name.lower())
                for exe in candidates[:60]:
                    stem = re.sub(r"[^a-z0-9]", "", exe.stem.lower())
                    if len(stem) > 2 and (stem in key or key in stem) and not _SKIP_WORDS.search(exe.stem):
                        out.append(AppEntry(exe.stem, str(exe), "exe", exe.name.lower(), "program-files"))
                        break
        return out

    # ---------------------------------------------------------- windows
    def _hwnd_info(self, hwnd: int) -> WindowInfo | None:
        import psutil

        length = self.user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        self.user32.GetWindowTextW(hwnd, buf, length + 1)
        pid = wintypes.DWORD()
        self.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        try:
            pname = psutil.Process(pid.value).name()
        except (psutil.Error, ValueError):
            pname = ""
        return WindowInfo(int(hwnd), buf.value, pname, int(pid.value))

    def active_window(self) -> WindowInfo | None:
        hwnd = self.user32.GetForegroundWindow()
        if not hwnd:
            return None
        return self._hwnd_info(hwnd)

    def _is_cloaked(self, hwnd: int) -> bool:
        try:
            dwm = ctypes.WinDLL("dwmapi")
            cloaked = wintypes.DWORD()
            dwm.DwmGetWindowAttribute(wintypes.HWND(hwnd), 14, ctypes.byref(cloaked), ctypes.sizeof(cloaked))
            return bool(cloaked.value)
        except OSError:
            return False

    def list_windows(self) -> list[WindowInfo]:
        result: list[WindowInfo] = []
        WS_EX_TOOLWINDOW = 0x00000080
        GWL_EXSTYLE = -20
        enum_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def callback(hwnd: int, _lparam: int) -> bool:
            if not self.user32.IsWindowVisible(hwnd):
                return True
            if self.user32.GetWindowTextLengthW(hwnd) == 0:
                return True
            if self.user32.GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW:
                return True
            if self._is_cloaked(hwnd):
                return True
            info = self._hwnd_info(hwnd)
            if info and info.title not in ("Program Manager",):
                result.append(info)
            return True

        self.user32.EnumWindows(enum_proc(callback), 0)
        return result

    def focus_window(self, handle: int) -> bool:
        hwnd = wintypes.HWND(handle)
        if self.user32.IsIconic(hwnd):
            self.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        # Foreground lock workaround: a synthetic ALT press lets SetForegroundWindow succeed.
        self.user32.keybd_event(_VK["menu"], 0, 0, 0)
        ok = bool(self.user32.SetForegroundWindow(hwnd))
        self.user32.keybd_event(_VK["menu"], 0, KEYEVENTF_KEYUP, 0)
        return ok

    def set_window_state(self, handle: int, state: str) -> bool:
        cmd = {"minimize": 6, "maximize": 3, "restore": 9}.get(state)
        if cmd is None:
            raise Unsupported(f"Estado de janela desconhecido: {state}")
        self.user32.ShowWindow(wintypes.HWND(handle), cmd)
        return True

    def close_process_gracefully(self, pid: int) -> None:
        # taskkill without /F posts WM_CLOSE so apps can prompt to save work.
        run_quiet(["taskkill", "/PID", str(pid), "/T"], timeout=10)

    # ------------------------------------------------------------- audio
    def _endpoint(self) -> Any:
        try:
            from pycaw.pycaw import AudioUtilities  # type: ignore[import-not-found]
        except ImportError as exc:
            raise Unsupported("Instale o pacote 'pycaw' (setup.cmd) para controlar o volume.") from exc
        return AudioUtilities.GetSpeakers().EndpointVolume

    def get_master_volume(self) -> float | None:
        try:
            return self._com.call(lambda: round(self._endpoint().GetMasterVolumeLevelScalar() * 100, 1))
        except Exception:
            return None

    def set_master_volume(self, percent: float) -> None:
        pct = max(0.0, min(100.0, percent))
        try:
            self._com.call(lambda: self._endpoint().SetMasterVolumeLevelScalar(pct / 100.0, None))
        except Unsupported:
            raise
        except Exception as exc:
            raise Unsupported(f"Falha ao ajustar o volume: {exc}") from exc

    def get_mute(self) -> bool | None:
        try:
            return bool(self._com.call(lambda: self._endpoint().GetMute()))
        except Exception:
            return None

    def set_mute(self, muted: bool) -> None:
        try:
            self._com.call(lambda: self._endpoint().SetMute(1 if muted else 0, None))
        except Unsupported:
            raise
        except Exception as exc:
            raise Unsupported(f"Falha ao alternar o mudo: {exc}") from exc

    def list_audio_sessions(self) -> list[dict[str, Any]]:
        def work() -> list[dict[str, Any]]:
            from pycaw.pycaw import AudioUtilities  # type: ignore[import-not-found]

            sessions = []
            for s in AudioUtilities.GetAllSessions():
                proc = s.Process
                if proc is None:
                    continue
                try:
                    vol = s.SimpleAudioVolume.GetMasterVolume()
                except Exception:
                    vol = None
                sessions.append({"process": proc.name(), "pid": proc.pid,
                                 "volume": round(vol * 100, 1) if vol is not None else None})
            return sessions

        try:
            return self._com.call(work)
        except Exception:
            return []

    def set_app_volume(self, process_names: list[str], percent: float | None = None,
                       delta: float | None = None) -> list[dict[str, Any]]:
        wanted = {n.lower() for n in process_names}

        def work() -> list[dict[str, Any]]:
            from pycaw.pycaw import AudioUtilities  # type: ignore[import-not-found]

            changed = []
            for s in AudioUtilities.GetAllSessions():
                proc = s.Process
                if proc is None or proc.name().lower() not in wanted:
                    continue
                vol = s.SimpleAudioVolume
                current = vol.GetMasterVolume() * 100
                target = percent if percent is not None else current + (delta or 0)
                target = max(0.0, min(100.0, target))
                vol.SetMasterVolume(target / 100.0, None)
                changed.append({"process": proc.name(), "pid": proc.pid, "from": round(current), "to": round(target)})
            return changed

        try:
            return self._com.call(work)
        except ImportError as exc:
            raise Unsupported("Instale o pacote 'pycaw' (setup.cmd) para controlar o volume por aplicativo.") from exc

    def media_key(self, action: str) -> None:
        vk = _VK.get(action)
        if vk is None:
            raise Unsupported(f"Ação de mídia desconhecida: {action}")
        self.user32.keybd_event(vk, 0, 0, 0)
        self.user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)

    # ------------------------------------------------------------- power
    def lock(self) -> None:
        if not self.user32.LockWorkStation():
            raise Unsupported("O Windows recusou o bloqueio da sessão.")

    def sleep(self) -> None:
        powrprof = ctypes.WinDLL("powrprof")
        powrprof.SetSuspendState(0, 0, 0)

    def shutdown(self, restart: bool, delay_s: int) -> None:
        run_quiet(["shutdown", "/r" if restart else "/s", "/t", str(max(10, delay_s))], timeout=10)

    def cancel_shutdown(self) -> None:
        run_quiet(["shutdown", "/a"], timeout=10)

    # -------------------------------------------------------------- misc
    def settings_uri(self, page: str) -> str | None:
        return _SETTINGS_URIS.get(page)

    def clipboard_get(self) -> str | None:
        try:
            res = run_quiet(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                             "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw"], timeout=8)
        except (OSError, subprocess.TimeoutExpired):
            return None
        return res.stdout.rstrip("\r\n") if res.returncode == 0 else None

    def clipboard_set(self, text: str) -> bool:
        try:
            res = run_quiet(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                             "$input | Set-Clipboard"], timeout=8, input_text=text)
        except (OSError, subprocess.TimeoutExpired):
            return False
        return res.returncode == 0

    def user_folders(self) -> dict[str, Path]:
        out: dict[str, Path] = {"home": Path.home()}
        shell32 = ctypes.WinDLL("shell32")
        ole32 = ctypes.WinDLL("ole32")

        class GUID(ctypes.Structure):
            _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD), ("Data3", wintypes.WORD),
                        ("Data4", wintypes.BYTE * 8)]

        for key, guid_str in _KNOWN_FOLDERS.items():
            guid = GUID()
            if ole32.CLSIDFromString(ctypes.c_wchar_p(guid_str), ctypes.byref(guid)) != 0:
                continue
            path_ptr = ctypes.c_wchar_p()
            if shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(path_ptr)) == 0:
                if path_ptr.value:
                    out[key] = Path(path_ptr.value)
                ole32.CoTaskMemFree(path_ptr)
        return out

    def gpu_metrics(self) -> dict[str, Any] | None:
        smi = super().gpu_metrics()
        if smi:
            return smi
        with self._gpu_lock:
            ts, cached = self._gpu_cache
            if time.time() - ts < 10:
                return cached
            value: dict[str, Any] | None = None
            script = ("$s=(Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' "
                      "-ErrorAction SilentlyContinue).CounterSamples; "
                      "if ($s) { [math]::Round((($s | Measure-Object -Property CookedValue -Sum).Sum), 1) }")
            try:
                res = run_quiet(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], timeout=8)
                raw = res.stdout.strip().replace(",", ".")
                if res.returncode == 0 and raw:
                    value = {"name": "GPU", "percent": min(100.0, float(raw)), "memoryUsedMb": None,
                             "memoryTotalMb": None, "temperatureC": None, "source": "perf-counter"}
            except (OSError, subprocess.TimeoutExpired, ValueError):
                value = None
            self._gpu_cache = (time.time(), value)
            return value

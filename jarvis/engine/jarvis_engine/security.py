"""Security guards shared by file, process and terminal tools.

- Path guard: resolves symlinks/`..`, keeps writes inside user-approved roots and
  blocks system folders and credential stores (browser profiles, key stores).
- Process guard: critical OS processes can never be closed.
- Command guard: denylist applied to every command line Jarvis spawns.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from .config import IS_WINDOWS

# ---------------------------------------------------------------- paths --

def _win_protected() -> list[Path]:
    env = os.environ
    roots = [
        env.get("SystemRoot", r"C:\Windows"),
        env.get("ProgramFiles", r"C:\Program Files"),
        env.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        env.get("ProgramData", r"C:\ProgramData"),
        r"C:\$Recycle.Bin",
        r"C:\System Volume Information",
        r"C:\Recovery",
        r"C:\Boot",
    ]
    return [Path(r) for r in roots if r]


def _posix_protected() -> list[Path]:
    return [Path(p) for p in ("/bin", "/boot", "/dev", "/etc", "/lib", "/lib64", "/proc", "/sbin", "/sys",
                              "/usr", "/var", "/System", "/Library")]


# Credential stores and secrets: never read, never modified.
_SENSITIVE_FRAGMENTS = [
    "login data", "cookies", "web data", "local state",  # Chromium credential DBs
    "key3.db", "key4.db", "logins.json", "cert9.db",  # Firefox
    ".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker/config.json",
    "microsoft/credentials", "microsoft/protect", "microsoft/vault",
    "appdata/local/google/chrome/user data", "appdata/local/microsoft/edge/user data",
    "appdata/roaming/mozilla/firefox/profiles", "bravesoftware/brave-browser/user data",
    ".password-store", "keepass", ".kdbx", "wallet.dat", "id_rsa", "id_ed25519",
]


class PathDenied(PermissionError):
    pass


def normalize(path: str | os.PathLike[str]) -> Path:
    p = Path(os.path.expandvars(os.path.expanduser(str(path).strip().strip('"'))))
    try:
        return p.resolve(strict=False)
    except (OSError, RuntimeError):
        return Path(os.path.abspath(p))


def _is_within(child: Path, parent: Path) -> bool:
    try:
        child_s = os.path.normcase(str(child))
        parent_s = os.path.normcase(str(parent))
        return os.path.commonpath([child_s, parent_s]) == parent_s
    except ValueError:  # different drives on Windows
        return False


def is_sensitive(path: Path) -> bool:
    s = str(path).replace("\\", "/").lower()
    return any(frag in s for frag in _SENSITIVE_FRAGMENTS)


def protected_roots() -> list[Path]:
    return _win_protected() if IS_WINDOWS else _posix_protected()


def is_protected(path: Path) -> bool:
    for root in protected_roots():
        if _is_within(path, normalize(root)):
            return True
    # Drive roots themselves (C:\) are never valid targets for writes.
    return path.parent == path


def default_write_roots() -> list[Path]:
    return [normalize(Path.home())]


def check_read(path: str | os.PathLike[str]) -> Path:
    p = normalize(path)
    if is_sensitive(p):
        raise PathDenied("Esse caminho contém credenciais ou dados sensíveis e está bloqueado.")
    return p


# Types the shell would *run* (or that redirect to something runnable) when "opened".
# Based on Windows' high-risk attachment list plus shortcut/handler formats.
_EXECUTABLE_EXTS = frozenset("""
    .exe .com .scr .pif .cpl .msc .dll .ocx .sys .drv .bat .cmd .ps1 .ps1xml .ps2 .ps2xml .psc1 .psc2
    .psd1 .psm1 .vb .vbs .vbe .js .jse .ws .wsf .wsc .wsh .sct .hta .msi .msp .mst .jar .lnk .url
    .reg .inf .scf .application .appref-ms .gadget .xbap .appx .appxbundle .msix .msixbundle
    .settingcontent-ms .library-ms .search-ms .searchconnector-ms .theme .themepack .deskthemepack
    .diagcab .diagcfg .diagpkg .msh .msh1 .msh2 .mshxml .msh1xml .msh2xml .chm .hlp .shb .shs .xll
    .py .pyw .pyc .pyz .pyzw .rb .pl .sh .bash .command .desktop .run .appimage .elf .bin .apk
""".split())

# Documents and media that open in a viewer/editor; anything else asks first.
_VIEWABLE_EXTS = frozenset("""
    .txt .md .markdown .rtf .log .csv .tsv .json .yaml .yml .toml .ini .xml .html .htm .css .ts .tsx
    .jsx .c .h .cpp .hpp .cs .java .go .rs .php .sql .pdf .doc .docx .odt .xls .xlsx .ods .ppt .pptx .odp
    .epub .png .jpg .jpeg .gif .bmp .webp .svg .tif .tiff .heic .ico .mp3 .wav .flac .ogg .m4a .aac
    .wma .mp4 .mkv .mov .avi .webm .wmv .m4v .srt .zip .7z .rar .tar .gz
""".split())


def _open_ext(path: Path) -> str:
    # Windows ignores trailing dots/spaces ("setup.exe." runs setup.exe).
    name = path.name.rstrip(". ")
    return os.path.splitext(name)[1].lower()


def open_risk(path: Path) -> str:
    """How risky it is to hand `path` to the shell's default handler:
    'blocked' (it would run code), 'confirm' (unknown type) or 'safe'."""
    if path.is_dir():
        return "safe"
    ext = _open_ext(path)
    pathext = {e.strip().lower() for e in os.environ.get("PATHEXT", "").split(";") if e.strip()}
    if ext in _EXECUTABLE_EXTS or ext in pathext:
        return "blocked"
    return "safe" if ext in _VIEWABLE_EXTS else "confirm"


def check_write(path: str | os.PathLike[str], extra_roots: list[str] | None = None) -> Path:
    p = normalize(path)
    if is_sensitive(p):
        raise PathDenied("Esse caminho contém credenciais ou dados sensíveis e está bloqueado.")
    if is_protected(p):
        raise PathDenied("Não altero pastas do sistema operacional.")
    roots = default_write_roots() + [normalize(r) for r in (extra_roots or []) if r]
    if not any(_is_within(p, r) for r in roots):
        raise PathDenied("Só altero arquivos dentro da sua pasta de usuário ou de pastas autorizadas nas configurações.")
    if p in [normalize(r) for r in roots]:
        raise PathDenied("Não altero a raiz de uma pasta autorizada.")
    return p


_INVALID_NAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}


def safe_filename(name: str) -> str:
    name = name.strip().strip(".")
    if not name or _INVALID_NAME.search(name) or name.lower().split(".")[0] in _RESERVED or len(name) > 200:
        raise PathDenied(f"Nome inválido: '{name}'")
    return name


# ------------------------------------------------------------ processes --

CRITICAL_PROCESSES = {
    "system", "system idle process", "registry", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe",
    "services.exe", "lsass.exe", "lsaiso.exe", "svchost.exe", "dwm.exe", "fontdrvhost.exe", "sihost.exe",
    "msmpeng.exe", "nissrv.exe", "securityhealthservice.exe", "memcompression", "ctfmon.exe",
    "explorer.exe", "taskhostw.exe", "runtimebroker.exe", "spoolsv.exe", "audiodg.exe",
    # posix
    "systemd", "init", "kthreadd", "launchd", "xorg", "gnome-shell", "sshd", "dbus-daemon",
}


def is_critical_process(name: str) -> bool:
    return name.lower() in CRITICAL_PROCESSES


# -------------------------------------------------------------- commands --

_DENY_PATTERNS = [
    r"\bformat(\.com)?\s+[a-z]:", r"\bdiskpart\b", r"\bbcdedit\b", r"\bvssadmin\b", r"\bwbadmin\b",
    r"\bcipher\s+/w", r"\breg(\.exe)?\s+(delete|add)\b", r"\bdel(\.exe)?\s+.*?/[sq]", r"\brd\s+/s",
    r"\brmdir\s+/s", r"\brm\s+-[a-z]*r[a-z]*f?\s+/(\s|$)", r"\brm\s+-rf\b", r"\bmkfs\b", r"\bdd\s+if=",
    r"set-mppreference", r"add-mppreference", r"\bsc(\.exe)?\s+(stop|delete|config)\s+windefend",
    r"netsh\s+advfirewall\s+set", r"\binvoke-expression\b", r"\biex\b", r"-enc(odedcommand)?\b",
    r"\bcertutil\b.*-urlcache", r"\bbitsadmin\b", r"\bmshta\b", r"\bregsvr32\b", r"\brundll32\b.*javascript",
    r"\bschtasks\b.*/create", r"\bwmic\b.*shadowcopy", r"\bnet\s+user\b", r"\bnet\s+localgroup\b",
    r"\btakeown\b", r"\bicacls\b.*/grant", r"\bshutdown\b", r"curl[^|]*\|\s*(sh|bash|iex|powershell)",
    r"\bchmod\s+-R\s+777\s+/", r"\bsudo\b", r"\brunas\b",
]
_DENY_RE = [re.compile(p, re.IGNORECASE) for p in _DENY_PATTERNS]
# package.json scripts routinely clean build output ("rm -rf dist"); relative recursive
# deletes are allowed there, everything else on the denylist still applies.
_SCRIPT_OK = {r"\bdel(\.exe)?\s+.*?/[sq]", r"\brd\s+/s", r"\brmdir\s+/s", r"\brm\s+-rf\b"}
_SCRIPT_DENY_RE = [re.compile(p, re.IGNORECASE) for p in _DENY_PATTERNS if p not in _SCRIPT_OK]


class CommandDenied(PermissionError):
    pass


def check_command(argv: list[str]) -> None:
    line = " ".join(argv)
    for rx in _DENY_RE:
        if rx.search(line):
            raise CommandDenied(f"Comando bloqueado pela política de segurança ({rx.pattern}).")


def check_script(name: str, body: str) -> None:
    """Denylist for a package.json script body (what the package manager will run in a shell)."""
    for rx in _SCRIPT_DENY_RE:
        if rx.search(body):
            raise CommandDenied(f"O script '{name}' do package.json foi bloqueado pela política de segurança "
                                f"({rx.pattern}).")

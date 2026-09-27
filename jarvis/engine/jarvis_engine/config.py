"""Engine configuration: paths, network binding, auth token and .env.local loading.

Secrets (provider API keys) are only ever read from the process environment or
from `.env.local` files. They are never written to the database or sent to the UI.
"""

from __future__ import annotations

import os
import secrets
import sys
from dataclasses import dataclass, field
from pathlib import Path

VERSION = "1.0.0"

ENGINE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = ENGINE_DIR.parent

IS_WINDOWS = sys.platform == "win32"
IS_MAC = sys.platform == "darwin"
IS_LINUX = sys.platform.startswith("linux")

SECRET_ENV_KEYS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY")


def _default_data_dir() -> Path:
    if IS_WINDOWS:
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
        return base / "Jarvis" / "data"
    if IS_MAC:
        return Path.home() / "Library" / "Application Support" / "Jarvis" / "data"
    base = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    return base / "jarvis" / "data"


def parse_env_file(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE parser (supports comments, `export`, and quoted values)."""
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return values
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[len("export ") :]
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        elif " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        if key:
            values[key] = value
    return values


def env_file_candidates() -> list[Path]:
    return [PROJECT_DIR / ".env.local", ENGINE_DIR / ".env.local"]


def load_env_local(override: bool = False) -> list[Path]:
    """Load .env.local files into os.environ. Returns the files that were found."""
    loaded: list[Path] = []
    for candidate in env_file_candidates():
        if candidate.is_file():
            for key, value in parse_env_file(candidate).items():
                if override or key not in os.environ:
                    os.environ[key] = value
            loaded.append(candidate)
    return loaded


@dataclass
class EngineConfig:
    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8765
    token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    token_generated: bool = False
    dev: bool = False
    allowed_origins: tuple[str, ...] = ()
    env_files: tuple[Path, ...] = ()

    @property
    def db_path(self) -> Path:
        return self.data_dir / "jarvis.db"

    @property
    def models_dir(self) -> Path:
        return self.data_dir / "models"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.models_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)

    @classmethod
    def from_env(cls) -> "EngineConfig":
        env_files = tuple(load_env_local())
        data_dir = Path(os.environ.get("JARVIS_DATA_DIR") or _default_data_dir()).expanduser()
        host = os.environ.get("JARVIS_HOST", "127.0.0.1")
        if host not in ("127.0.0.1", "localhost", "::1"):
            # The engine controls the computer; it must never listen on a public interface.
            raise SystemExit("JARVIS_HOST must be a loopback address (127.0.0.1).")
        port = int(os.environ.get("JARVIS_PORT", "8765"))
        token = os.environ.get("JARVIS_TOKEN", "")
        generated = False
        if not token:
            token = secrets.token_urlsafe(32)
            generated = True
        dev = os.environ.get("JARVIS_DEV", "") in ("1", "true", "yes")
        origins = [o.strip() for o in os.environ.get("JARVIS_ALLOWED_ORIGINS", "").split(",") if o.strip()]
        return cls(
            data_dir=data_dir,
            host=host,
            port=port,
            token=token,
            token_generated=generated,
            dev=dev,
            allowed_origins=tuple(origins),
            env_files=env_files,
        )


def secret_status() -> dict[str, bool]:
    """Which provider keys are configured (never the values)."""
    return {key: bool(os.environ.get(key)) for key in SECRET_ENV_KEYS}

"""Entry point: `python -m jarvis_engine`.

Environment:
  JARVIS_PORT   port on 127.0.0.1 (default 8765)
  JARVIS_TOKEN  shared secret with the desktop shell (generated if absent)
  JARVIS_DATA_DIR  data directory (default %APPDATA%/Jarvis/data)
  JARVIS_DEV    1 for verbose logs
"""

from __future__ import annotations

import sys


def main() -> None:
    import uvicorn

    from .activity import configure_logging
    from .config import EngineConfig
    from .server import create_app

    config = EngineConfig.from_env()
    config.ensure_dirs()
    configure_logging(config.logs_dir, config.dev)
    if config.token_generated:
        # Standalone/dev run: show the token so a dev client can connect. Electron always passes its own.
        print(f"[jarvis] token de desenvolvimento: {config.token}", file=sys.stderr, flush=True)
    app = create_app(config)
    print(f"[jarvis] engine em http://{config.host}:{config.port}", file=sys.stderr, flush=True)
    uvicorn.run(app, host=config.host, port=config.port, log_level="warning", ws_max_size=8 * 1024 * 1024,
                ws_ping_interval=20, ws_ping_timeout=20, access_log=False)


if __name__ == "__main__":
    main()

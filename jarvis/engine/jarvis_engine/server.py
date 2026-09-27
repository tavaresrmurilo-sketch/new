"""HTTP/WebSocket server (loopback only).

Security model
- Binds to 127.0.0.1 only (config refuses anything else).
- Every WebSocket must authenticate within 5 s with the per-launch token that
  the Electron shell generates and hands to its own renderer via preload.
- Browser Origin is checked, so a random web page cannot drive the engine even
  if it guessed the port.
- The only unauthenticated endpoint is /health (no sensitive data).
"""

from __future__ import annotations

import asyncio
import json
import os
import secrets
import shutil
import time
from contextlib import asynccontextmanager
from typing import Any, Awaitable, Callable

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .activity import Category
from .config import PROJECT_DIR, VERSION, EngineConfig, load_env_local, secret_status
from .eventbus import Event
from .services.container import Services, build_services, init_checks, start_services, stop_services
from .settings import SettingsError

DEFAULT_ORIGINS = {"null", "file://", "app://jarvis", "http://localhost:5173", "http://127.0.0.1:5173"}
AUTH_TIMEOUT_S = 5.0
MAX_TEXT_MESSAGE = 256 * 1024


class RpcError(Exception):
    pass


def _int(params: dict[str, Any], key: str, default: int | None = None) -> int:
    v = params.get(key, default)
    if v is None or isinstance(v, bool):
        raise RpcError(f"'{key}' obrigatório")
    try:
        return int(v)
    except (TypeError, ValueError):
        raise RpcError(f"'{key}' deve ser inteiro") from None


def _str(params: dict[str, Any], key: str, default: str | None = None, max_len: int = 5000) -> str:
    v = params.get(key, default)
    if v is None:
        raise RpcError(f"'{key}' obrigatório")
    if not isinstance(v, str):
        raise RpcError(f"'{key}' deve ser texto")
    if len(v) > max_len:
        raise RpcError(f"'{key}' muito longo")
    return v


def create_app(config: EngineConfig, services: Services | None = None, background: bool = True) -> FastAPI:
    holder: dict[str, Services] = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):  # type: ignore[no-untyped-def]
        s = services or build_services(config)
        holder["s"] = s
        await start_services(s, background=background)

        async def forward(ev: Event) -> None:
            await s.hub.broadcast(ev.to_wire())

        unsub = s.bus.subscribe("*", forward)
        try:
            yield
        finally:
            unsub()
            await stop_services(s)

    app = FastAPI(title="Jarvis Engine", version=VERSION, lifespan=lifespan, docs_url=None, redoc_url=None,
                  openapi_url=None)
    app.state.holder = holder

    @app.get("/health")
    async def health() -> dict[str, Any]:
        s = holder.get("s")
        return {"status": "ok" if s else "starting", "version": VERSION,
                "uptimeS": round(time.time() - s.started_at, 1) if s else 0,
                "platform": s.platform.name if s else None}

    @app.websocket("/ws")
    async def ws_endpoint(ws: WebSocket) -> None:
        s = holder["s"]
        origin = ws.headers.get("origin")
        allowed = DEFAULT_ORIGINS | set(config.allowed_origins)
        if origin is not None and origin not in allowed:
            s.activity.log(Category.SECURITY, "Conexão WebSocket recusada (origem não permitida)", level="warning",
                           origin=origin)
            await ws.close(code=4403)
            return
        await ws.accept()
        try:
            first = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_TIMEOUT_S)
            hello = json.loads(first)
        except (asyncio.TimeoutError, ValueError, WebSocketDisconnect, RuntimeError):
            await _safe_close(ws, 4401)
            return
        token = str(hello.get("token", ""))
        if hello.get("type") != "auth" or not secrets.compare_digest(token, config.token):
            s.activity.log(Category.SECURITY, "Conexão WebSocket recusada (token inválido)", level="warning")
            await _safe_close(ws, 4401)
            return
        info = hello.get("client") or {}
        client = s.hub.add(ws, str(info.get("kind", "web")), list(info.get("capabilities") or []))
        s.activity.log(Category.SYSTEM, f"Interface conectada ({client.kind})", clientId=client.id)
        await s.hub.send(client, {"type": "hello", "version": VERSION, "clientId": client.id,
                                  "snapshot": await snapshot(s)})
        rpc = RpcDispatcher(s, config)
        pending: set[asyncio.Task[Any]] = set()

        def spawn(coro: Awaitable[Any]) -> None:
            t = asyncio.ensure_future(coro)
            pending.add(t)
            t.add_done_callback(pending.discard)

        try:
            while True:
                msg = await ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if msg.get("bytes") is not None:
                    spawn(_handle_binary(s, client, msg["bytes"]))
                    continue
                raw = msg.get("text")
                if not raw or len(raw) > MAX_TEXT_MESSAGE:
                    continue
                try:
                    data = json.loads(raw)
                except ValueError:
                    continue
                if not isinstance(data, dict):
                    continue
                kind = data.get("type")
                if kind == "command":
                    text = data.get("text")
                    if isinstance(text, str) and 0 < len(text) <= 4000:
                        spawn(s.core.submit(text, "voice" if data.get("source") == "voice" else "text"))
                elif kind == "rpc":
                    spawn(_handle_rpc(s, client, rpc, data))
                elif kind == "permission.respond":
                    s.permissions.respond(str(data.get("id", "")), bool(data.get("approved")))
                elif kind == "client.response":
                    s.hub.resolve(str(data.get("id", "")), data.get("result"), data.get("error"))
                elif kind == "voice.interrupt":
                    spawn(s.voice.interrupt())
                elif kind == "voice.speech_ended":
                    s.voice.speech_finished()
                elif kind == "ping":
                    await s.hub.send(client, {"type": "pong", "ts": time.time()})
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            s.hub.remove(client.id)
            s.activity.log(Category.SYSTEM, f"Interface desconectada ({client.kind})", clientId=client.id)

    return app


async def _safe_close(ws: WebSocket, code: int) -> None:
    try:
        await ws.close(code=code)
    except RuntimeError:
        pass


async def _handle_binary(s: Services, client: Any, frame: bytes) -> None:
    if len(frame) < 4:
        return
    hlen = int.from_bytes(frame[:4], "big")
    if hlen <= 0 or hlen > 4096 or len(frame) < 4 + hlen:
        return
    try:
        header = json.loads(frame[4:4 + hlen].decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return
    payload = frame[4 + hlen:]
    if len(payload) % 2:
        payload = payload[:-1]
    kind = header.get("kind")
    if kind == "utterance":
        await s.voice.handle_utterance(client, payload, header)
    elif kind == "frame":
        await s.voice.handle_frame(client, payload)


async def _handle_rpc(s: Services, client: Any, rpc: "RpcDispatcher", data: dict[str, Any]) -> None:
    req_id = data.get("id")
    method = str(data.get("method", ""))
    params = data.get("params") or {}
    if not isinstance(params, dict):
        params = {}
    try:
        result = await rpc.call(method, params)
        await s.hub.send(client, {"type": "rpc.result", "id": req_id, "ok": True, "result": result})
    except (RpcError, SettingsError, ValueError) as exc:
        await s.hub.send(client, {"type": "rpc.result", "id": req_id, "ok": False, "error": str(exc)})
    except Exception as exc:  # unexpected
        s.activity.log(Category.ERROR, f"RPC {method} falhou", level="error", error=f"{type(exc).__name__}: {exc}")
        await s.hub.send(client, {"type": "rpc.result", "id": req_id, "ok": False,
                                  "error": "Erro interno. Veja o painel Atividade."})


async def snapshot(s: Services) -> dict[str, Any]:
    return {
        "settings": s.settings.all(),
        "context": s.context.public(),
        "tasks": s.tasks.list(10),
        "permissions": s.permissions.pending,
        "notifications": s.notifier.list()[:20],
        "metrics": s.monitor.last or None,
        "voice": s.voice.status(),
        "index": s.files.status.to_dict(),
        "apps": len(s.apps.entries),
        "state": s.core.state,
        "focusMode": s.notifier.focus_mode,
        "platform": s.platform.name,
        "dataDir": str(s.config.data_dir),
        "secrets": secret_status(),
        "terminal": s.terminal.public(),
        "history": s.history.messages(limit=30),
    }


class RpcDispatcher:
    def __init__(self, s: Services, config: EngineConfig) -> None:
        self.s = s
        self.config = config
        self.methods: dict[str, Callable[[dict[str, Any]], Awaitable[Any]]] = {
            name.replace("rpc_", "").replace("__", "."): getattr(self, name)
            for name in dir(self) if name.startswith("rpc_")
        }

    async def call(self, method: str, params: dict[str, Any]) -> Any:
        fn = self.methods.get(method)
        if fn is None:
            raise RpcError(f"método desconhecido: {method}")
        return await fn(params)

    # --- state / settings -------------------------------------------------
    async def rpc_state__snapshot(self, p: dict[str, Any]) -> Any:
        return await snapshot(self.s)

    async def rpc_init__checks(self, p: dict[str, Any]) -> Any:
        return await init_checks(self.s)

    async def rpc_settings__get(self, p: dict[str, Any]) -> Any:
        return self.s.settings.all()

    async def rpc_settings__update(self, p: dict[str, Any]) -> Any:
        patch = p.get("patch")
        if not isinstance(patch, dict):
            raise RpcError("'patch' deve ser um objeto")
        before_ai = self.s.settings.ai.model_dump()
        result = await self.s.settings.update(patch)
        if "ai" in patch or "privacy" in patch:
            self.s.providers._health.clear()
        if "voice" in patch:
            asyncio.create_task(self.s.voice.preload())
        self.s.activity.log(Category.SYSTEM, "Configurações atualizadas", sections=list(patch))
        if before_ai != self.s.settings.ai.model_dump():
            await self.s.bus.publish("ai.provider", await self.s.providers.status())
        return result

    async def rpc_settings__reset(self, p: dict[str, Any]) -> Any:
        return await self.s.settings.reset(_str(p, "section", max_len=40))

    # --- command / context ---------------------------------------------------
    async def rpc_command__run(self, p: dict[str, Any]) -> Any:
        await self.s.core.submit(_str(p, "text", max_len=4000), "text")
        return True

    async def rpc_context__get(self, p: dict[str, Any]) -> Any:
        return self.s.context.public()

    async def rpc_history__messages(self, p: dict[str, Any]) -> Any:
        cid = p.get("conversationId")
        return self.s.history.messages(int(cid) if cid else None)

    async def rpc_history__conversations(self, p: dict[str, Any]) -> Any:
        return self.s.history.conversations()

    # --- memory -----------------------------------------------------------
    async def rpc_memory__list(self, p: dict[str, Any]) -> Any:
        q = p.get("query")
        cat = p.get("category") or None
        if q:
            return self.s.memory.search(str(q)[:200], limit=100, category=cat)
        return self.s.memory.list(cat)

    async def rpc_memory__create(self, p: dict[str, Any]) -> Any:
        if not self.s.settings.privacy.memory_enabled:
            raise RpcError("A memória está desativada em Privacidade.")
        return self.s.memory.add(_str(p, "content", max_len=2000), p.get("category"), "manual",
                                 str(p.get("tags", ""))[:200])

    async def rpc_memory__update(self, p: dict[str, Any]) -> Any:
        res = self.s.memory.update(_int(p, "id"), content=p.get("content"), category=p.get("category"),
                                   tags=p.get("tags"))
        if res is None:
            raise RpcError("memória não encontrada")
        return res

    async def rpc_memory__delete(self, p: dict[str, Any]) -> Any:
        return self.s.memory.delete(_int(p, "id"))

    # --- notes --------------------------------------------------------------
    async def rpc_notes__list(self, p: dict[str, Any]) -> Any:
        q = p.get("query")
        return self.s.notes.search(str(q)[:200], 100) if q else self.s.notes.list(200)

    async def rpc_notes__create(self, p: dict[str, Any]) -> Any:
        return self.s.notes.create(_str(p, "content", "", max_len=20000), str(p.get("title", ""))[:200])

    async def rpc_notes__update(self, p: dict[str, Any]) -> Any:
        res = self.s.notes.update(_int(p, "id"), title=p.get("title"), content=p.get("content"))
        if res is None:
            raise RpcError("nota não encontrada")
        return res

    async def rpc_notes__delete(self, p: dict[str, Any]) -> Any:
        return self.s.notes.delete(_int(p, "id"))

    # --- reminders ---------------------------------------------------------
    async def rpc_reminders__list(self, p: dict[str, Any]) -> Any:
        status = p.get("status", "pending")
        return self.s.reminders.list(status if status in ("pending", "done", "cancelled", "missed") else None)

    async def rpc_reminders__create(self, p: dict[str, Any]) -> Any:
        res = await self.s.executor.execute("create_reminder", {"text": _str(p, "text", max_len=500)}, source="ui")
        if not res.ok:
            raise RpcError(res.message)
        return res.data.get("reminder")

    async def rpc_reminders__cancel(self, p: dict[str, Any]) -> Any:
        return self.s.reminders.cancel(_int(p, "id"))

    async def rpc_reminders__delete(self, p: dict[str, Any]) -> Any:
        return self.s.reminders.delete(_int(p, "id"))

    # --- tasks / tools / permissions -----------------------------------------
    async def rpc_tasks__list(self, p: dict[str, Any]) -> Any:
        return self.s.tasks.list(_int(p, "limit", 30))

    async def rpc_tasks__cancel(self, p: dict[str, Any]) -> Any:
        return self.s.tasks.cancel(_str(p, "id", max_len=40))

    async def rpc_tasks__cancel_all(self, p: dict[str, Any]) -> Any:
        return await self.s.core.cancel_everything()

    async def rpc_tools__list(self, p: dict[str, Any]) -> Any:
        stats = {r["tool_id"]: r for r in self.s.db.query("SELECT * FROM tools")}
        overrides = self.s.permissions.overrides()
        out = []
        for t in self.s.registry.all():
            d = t.public()
            d["policy"] = self.s.permissions.policy_for(t)
            d["override"] = overrides.get(t.id)
            st = stats.get(t.id) or {}
            d["calls"] = st.get("calls", 0)
            d["failures"] = st.get("failures", 0)
            d["lastUsedAt"] = st.get("last_used_at")
            out.append(d)
        return out

    async def rpc_tools__execute(self, p: dict[str, Any]) -> Any:
        args = p.get("args") or {}
        if not isinstance(args, dict):
            raise RpcError("'args' deve ser um objeto")
        res = await self.s.executor.execute(_str(p, "toolId", max_len=60), args, source="ui")
        return res.to_dict()

    async def rpc_permissions__set(self, p: dict[str, Any]) -> Any:
        tool = self.s.registry.get(_str(p, "toolId", max_len=60))
        if tool is None:
            raise RpcError("ferramenta desconhecida")
        return self.s.permissions.set_policy(tool, p.get("policy"))

    async def rpc_permissions__respond(self, p: dict[str, Any]) -> Any:
        return self.s.permissions.respond(_str(p, "id", max_len=40), bool(p.get("approved")))

    # --- activity ----------------------------------------------------------
    async def rpc_activity__list(self, p: dict[str, Any]) -> Any:
        return self.s.activity.list(_int(p, "limit", 200), p.get("category") or None, p.get("query") or None)

    async def rpc_activity__clear(self, p: dict[str, Any]) -> Any:
        return self.s.activity.clear()

    # --- apps / files -------------------------------------------------------
    async def rpc_apps__list(self, p: dict[str, Any]) -> Any:
        q = p.get("query")
        if q:
            return [m.to_dict() for m in self.s.apps.resolve(str(q)[:120], limit=20)]
        return self.s.apps.public()

    async def rpc_apps__refresh(self, p: dict[str, Any]) -> Any:
        return await self.s.apps.refresh()

    async def rpc_files__status(self, p: dict[str, Any]) -> Any:
        return self.s.files.status.to_dict() | {"roots": [str(r) for r in self.s.files.roots()]}

    async def rpc_files__reindex(self, p: dict[str, Any]) -> Any:
        asyncio.create_task(self.s.files.scan_async())
        return True

    async def rpc_files__search(self, p: dict[str, Any]) -> Any:
        return await asyncio.to_thread(self.s.files.search, _str(p, "query", "", max_len=200), limit=50)

    # --- providers / voice ---------------------------------------------------
    async def rpc_providers__status(self, p: dict[str, Any]) -> Any:
        return await self.s.providers.status(force=bool(p.get("force")))

    async def rpc_providers__models(self, p: dict[str, Any]) -> Any:
        name = _str(p, "provider", max_len=20)
        provider = self.s.providers.build(name)
        if provider is None:
            return {"ok": False, "detail": "Sem provedor", "models": []}
        h = await provider.health_check()
        return {"ok": h.ok, "detail": h.detail, "models": h.models, "external": provider.is_external}

    async def rpc_voice__status(self, p: dict[str, Any]) -> Any:
        return self.s.voice.status()

    async def rpc_voice__download(self, p: dict[str, Any]) -> Any:
        kind = _str(p, "kind", max_len=10)
        if kind not in ("stt", "tts", "wake"):
            raise RpcError("tipo inválido")
        try:
            return await self.s.voice.download(kind, p.get("name"))
        except Exception as exc:
            raise RpcError(f"Falha no download: {exc}") from exc

    async def rpc_voice__test(self, p: dict[str, Any]) -> Any:
        await self.s.voice.speak(str(p.get("text") or "Sistemas de voz operacionais."))
        return True

    # --- terminal ----------------------------------------------------------
    async def rpc_terminal__list(self, p: dict[str, Any]) -> Any:
        return self.s.terminal.public()

    async def rpc_terminal__output(self, p: dict[str, Any]) -> Any:
        mp = self.s.terminal.get(_str(p, "id", max_len=20))
        if mp is None:
            raise RpcError("processo não encontrado")
        return mp.public(with_output=True, tail=1000)

    async def rpc_terminal__stop(self, p: dict[str, Any]) -> Any:
        return await self.s.terminal.stop(_str(p, "id", max_len=20))

    # --- notifications --------------------------------------------------------
    async def rpc_notifications__list(self, p: dict[str, Any]) -> Any:
        return self.s.notifier.list()

    async def rpc_notifications__read(self, p: dict[str, Any]) -> Any:
        ids = p.get("ids")
        self.s.notifier.mark_read(ids if isinstance(ids, list) else None)
        return True

    async def rpc_notifications__clear(self, p: dict[str, Any]) -> Any:
        self.s.notifier.clear()
        return True

    # --- privacy -----------------------------------------------------------
    async def rpc_privacy__summary(self, p: dict[str, Any]) -> Any:
        s = self.s
        db = s.db
        return {
            "dataDir": str(s.config.data_dir),
            "counts": {
                "memories": s.memory.count(), "notes": s.notes.count(),
                "reminders": int(db.scalar("SELECT COUNT(*) FROM reminders") or 0),
                "messages": s.history.count(),
                "activity": int(db.scalar("SELECT COUNT(*) FROM activity_logs") or 0),
                "tasks": int(db.scalar("SELECT COUNT(*) FROM tasks") or 0),
                "files": s.files.status.files, "apps": len(s.apps.entries),
            },
            "provider": await s.providers.status(),
            "secrets": secret_status(),
            "permissions": s.permissions.overrides(),
            "telemetry": "O Jarvis não envia telemetria.",
            "settings": s.settings.privacy.model_dump(),
        }

    async def rpc_privacy__clear(self, p: dict[str, Any]) -> Any:
        scope = _str(p, "scope", max_len=20)
        s = self.s
        cleared: dict[str, int] = {}
        if scope in ("history", "all"):
            cleared["messages"] = s.history.clear()
        if scope in ("activity", "all"):
            cleared["activity"] = s.activity.clear()
        if scope in ("memories", "all"):
            cleared["memories"] = s.memory.clear()
        if scope in ("tasks", "all"):
            cleared["tasks"] = s.tasks.clear_history()
        if scope in ("file_index", "all"):
            cleared["files"] = int(s.db.scalar("SELECT COUNT(*) FROM files") or 0)
            s.db.execute("DELETE FROM files")
            s.db.execute("DELETE FROM files_fts")
            s.files._refresh_counts()
        if not cleared:
            raise RpcError("escopo inválido")
        s.activity.log(Category.SECURITY, f"Dados apagados pelo usuário ({scope})", **cleared)
        return cleared

    async def rpc_privacy__export(self, p: dict[str, Any]) -> Any:
        s = self.s
        return {
            "exportedAt": time.time(), "memories": s.memory.list(limit=10000), "notes": s.notes.list(10000),
            "reminders": s.reminders.list(None, 10000), "settings": s.settings.all(),
        }

    # --- env / system --------------------------------------------------------
    async def rpc_env__status(self, p: dict[str, Any]) -> Any:
        target = PROJECT_DIR / ".env.local"
        return {"secrets": secret_status(), "envFile": str(target), "exists": target.is_file()}

    async def rpc_env__open(self, p: dict[str, Any]) -> Any:
        target = PROJECT_DIR / ".env.local"
        if not target.exists():
            example = PROJECT_DIR / ".env.example"
            if example.is_file():
                shutil.copyfile(example, target)
            else:
                target.write_text("# Jarvis — chaves locais (nunca versionar)\n", encoding="utf-8")
        await asyncio.to_thread(self.s.platform.open_path, target)
        return str(target)

    async def rpc_env__reload(self, p: dict[str, Any]) -> Any:
        for key in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"):
            os.environ.pop(key, None)
        load_env_local(override=True)
        self.s.providers._health.clear()
        return secret_status()

    async def rpc_system__snapshot(self, p: dict[str, Any]) -> Any:
        return await asyncio.to_thread(self.s.monitor.sample)

    async def rpc_system__processes(self, p: dict[str, Any]) -> Any:
        rows = await asyncio.to_thread(self.s.monitor.top_processes, "memory", 300)
        return self.s.monitor.aggregate_by_name(rows)[:_int(p, "limit", 15)]

    async def rpc_focus__set(self, p: dict[str, Any]) -> Any:
        res = await self.s.executor.execute("focus_mode", {"enabled": bool(p.get("enabled"))}, source="ui")
        return res.to_dict()

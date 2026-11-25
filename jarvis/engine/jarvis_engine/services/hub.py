"""ClientHub: connected UI clients + the ClientBridge RPC used for desktop-only capabilities.

Some capabilities belong to the Electron shell (native notifications, screen
capture via desktopCapturer, clipboard, speech synthesis with the OS voices).
Tools ask the hub to `request()` them from a connected client that declared
that capability; the client answers with `client.response`.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Protocol


class _Socket(Protocol):
    async def send_text(self, data: str) -> None: ...

    async def send_bytes(self, data: bytes) -> None: ...


class BridgeError(RuntimeError):
    pass


@dataclass
class Client:
    id: str
    ws: _Socket
    kind: str = "main"  # main | mini | palette | web
    capabilities: set[str] = field(default_factory=set)
    connected_at: float = field(default_factory=time.time)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    alive: bool = True

    def public(self) -> dict[str, Any]:
        return {"id": self.id, "kind": self.kind, "capabilities": sorted(self.capabilities),
                "connectedAt": self.connected_at}


class ClientHub:
    def __init__(self) -> None:
        self.clients: dict[str, Client] = {}
        self._pending: dict[str, asyncio.Future[Any]] = {}

    def add(self, ws: _Socket, kind: str, capabilities: list[str]) -> Client:
        client = Client(secrets.token_hex(6), ws, kind if kind in ("main", "mini", "palette", "web") else "web",
                        {c for c in capabilities if isinstance(c, str) and len(c) < 40})
        self.clients[client.id] = client
        return client

    def remove(self, client_id: str) -> None:
        client = self.clients.pop(client_id, None)
        if client:
            client.alive = False

    def has_clients(self) -> bool:
        return bool(self.clients)

    def has_capability(self, capability: str) -> bool:
        return any(capability in c.capabilities for c in self.clients.values())

    def pick(self, capability: str) -> Client | None:
        candidates = [c for c in self.clients.values() if capability in c.capabilities]
        if not candidates:
            return None
        # Prefer the main window, then the most recently connected.
        candidates.sort(key=lambda c: (c.kind != "main", -c.connected_at))
        return candidates[0]

    async def send(self, client: Client, message: dict[str, Any]) -> bool:
        if not client.alive:
            return False
        try:
            async with client.lock:
                await client.ws.send_text(json.dumps(message, ensure_ascii=False, default=str))
            return True
        except Exception:
            client.alive = False
            self.remove(client.id)
            return False

    async def send_binary(self, client: Client, header: dict[str, Any], payload: bytes) -> bool:
        head = json.dumps(header).encode("utf-8")
        frame = len(head).to_bytes(4, "big") + head + payload
        if not client.alive:
            return False
        try:
            async with client.lock:
                await client.ws.send_bytes(frame)
            return True
        except Exception:
            client.alive = False
            self.remove(client.id)
            return False

    async def broadcast(self, message: dict[str, Any], kinds: tuple[str, ...] | None = None) -> None:
        targets = [c for c in list(self.clients.values()) if kinds is None or c.kind in kinds]
        if targets:
            await asyncio.gather(*(self.send(c, message) for c in targets), return_exceptions=True)

    # ------------------------------------------------------------- bridge
    async def request(self, capability: str, op: str, params: dict[str, Any] | None = None,
                      timeout: float = 20.0) -> Any:
        client = self.pick(capability)
        if client is None:
            raise BridgeError("A interface do Jarvis não está conectada para executar essa ação.")
        req_id = secrets.token_hex(8)
        fut: asyncio.Future[Any] = asyncio.get_running_loop().create_future()
        self._pending[req_id] = fut
        sent = await self.send(client, {"type": "client.request", "id": req_id, "op": op, "params": params or {}})
        if not sent:
            self._pending.pop(req_id, None)
            raise BridgeError("Não consegui falar com a interface do Jarvis.")
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError as exc:
            raise BridgeError("A interface não respondeu a tempo.") from exc
        finally:
            self._pending.pop(req_id, None)

    def resolve(self, req_id: str, result: Any = None, error: str | None = None) -> bool:
        fut = self._pending.get(req_id)
        if fut is None or fut.done():
            return False
        if error:
            fut.set_exception(BridgeError(error))
        else:
            fut.set_result(result)
        return True

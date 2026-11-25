"""WebSocket protocol: auth, origin check, RPC, commands, binary frames, reconnection."""

import json

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from jarvis_engine.server import create_app
from jarvis_engine.services.container import build_services


@pytest.fixture
def client(config, platform):
    services = build_services(config, platform=platform)
    app = create_app(config, services=services, background=False)
    with TestClient(app) as c:
        yield c, services


class connect:
    """Authenticated WebSocket session that always closes cleanly."""

    def __init__(self, c, token="test-token", origin=None, kind="main", caps=("notifications",)):
        headers = {"origin": origin} if origin else {}
        self.cm = c.websocket_connect("/ws", headers=headers)
        self.token, self.kind, self.caps = token, kind, caps

    def __enter__(self):
        sock = self.cm.__enter__()
        sock.send_text(json.dumps({"type": "auth", "token": self.token,
                                   "client": {"kind": self.kind, "capabilities": list(self.caps)}}))
        return sock

    def __exit__(self, *exc):
        try:
            self.cm.__exit__(None, None, None)
        except Exception:
            pass
        return False


def recv_until(sock, pred, limit=300):
    for _ in range(limit):
        msg = sock.receive_json()
        if pred(msg):
            return msg
    raise AssertionError("message not received")


def rpc(sock, i, method, params=None):
    sock.send_text(json.dumps({"type": "rpc", "id": i, "method": method, "params": params or {}}))
    return recv_until(sock, lambda m: m.get("type") == "rpc.result" and m["id"] == i)


def test_health(client):
    c, _ = client
    r = c.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_rejects_bad_token(client):
    c, _ = client
    with connect(c, token="wrong") as sock:
        with pytest.raises(WebSocketDisconnect) as exc:
            sock.receive_json()
    assert exc.value.code == 4401


def test_rejects_foreign_origin(client):
    c, _ = client
    with pytest.raises(WebSocketDisconnect) as exc:
        with c.websocket_connect("/ws", headers={"origin": "https://evil.example"}) as sock:
            sock.receive_json()
    assert exc.value.code == 4403


def test_hello_snapshot_and_command(client):
    c, _ = client
    with connect(c, origin="http://localhost:5173") as sock:
        hello = sock.receive_json()
        assert hello["type"] == "hello"
        snap = hello["snapshot"]
        assert {"settings", "tasks", "voice", "metrics", "secrets"} <= set(snap)
        assert all(isinstance(v, bool) for v in snap["secrets"].values())  # never the key values
        sock.send_text(json.dumps({"type": "command", "text": "Jarvis."}))
        msg = recv_until(sock, lambda m: m.get("event") == "ai.response")
        assert msg["data"]["text"] == "À disposição."


def test_rpc_settings_validation(client):
    c, services = client
    with connect(c) as sock:
        sock.receive_json()
        res = rpc(sock, 1, "settings.update", {"patch": {"voice": {"follow_up_seconds": 999}}})
        assert res["ok"] is False and "follow_up_seconds" in res["error"]
        res = rpc(sock, 2, "settings.update", {"patch": {"general": {"user_name": "Tony"}}})
        assert res["ok"] and res["result"]["general"]["user_name"] == "Tony"
        assert services.settings.general.user_name == "Tony"
        res = rpc(sock, 3, "settings.update", {"patch": {"general": {"hacker": True}}})
        assert res["ok"] is False


def test_settings_persist_across_restart(config, platform):
    s1 = build_services(config, platform=platform)
    import asyncio

    asyncio.run(s1.settings.update({"appearance": {"compact_mode": True}}))
    s1.db.close()
    s2 = build_services(config, platform=platform)
    assert s2.settings.appearance.compact_mode is True
    s2.db.close()


def test_rpc_unknown_method(client):
    c, _ = client
    with connect(c) as sock:
        sock.receive_json()
        res = rpc(sock, 9, "os.system", {"cmd": "calc"})
        assert res["ok"] is False and "desconhecido" in res["error"]


def test_rpc_memory_crud_and_privacy(client):
    c, _ = client
    with connect(c) as sock:
        sock.receive_json()
        created = rpc(sock, 1, "memory.create", {"content": "Prefiro respostas curtas",
                                                 "category": "preference"})["result"]
        assert created["category"] == "preference"
        assert rpc(sock, 2, "memory.list", {"query": "respostas"})["result"][0]["id"] == created["id"]
        assert rpc(sock, 3, "memory.update", {"id": created["id"], "content": "Prefiro respostas objetivas"})["ok"]
        summary = rpc(sock, 4, "privacy.summary")["result"]
        assert summary["counts"]["memories"] == 1 and "telemetria" in summary["telemetry"]
        assert rpc(sock, 5, "privacy.clear", {"scope": "memories"})["result"]["memories"] == 1
        checks = rpc(sock, 6, "init.checks")["result"]
        modules = {c["module"]: c["status"] for c in checks}
        assert modules["Memory"] == "online" and modules["Tool Registry"] == "online"
        assert modules["AI Provider"] in ("online", "offline")


def test_permission_roundtrip_over_ws(client, home):
    c, _ = client
    with connect(c) as sock:
        sock.receive_json()
        sock.send_text(json.dumps({"type": "command", "text": "Apague o arquivo relatorio-q3.txt"}))
        req = recv_until(sock, lambda m: m.get("event") == "permission.request")
        assert req["data"]["level"] == 3 and "Lixeira" in req["data"]["summary"]
        sock.send_text(json.dumps({"type": "permission.respond", "id": req["data"]["id"], "approved": False}))
        msg = recv_until(sock, lambda m: m.get("event") == "ai.response")
        assert "não vou" in msg["data"]["text"]
    assert (home / "Documents" / "relatorio-q3.txt").exists()


def test_binary_frame_rejects_garbage(client):
    c, _ = client
    with connect(c) as sock:
        sock.receive_json()
        sock.send_bytes(b"\x00\x00\xff\xffgarbage")
        sock.send_text(json.dumps({"type": "ping"}))
        assert recv_until(sock, lambda m: m.get("type") == "pong")


def test_reconnect_gets_fresh_snapshot(client):
    c, services = client
    with connect(c) as sock:
        sock.receive_json()
    with connect(c) as sock2:
        hello = sock2.receive_json()
        assert hello["type"] == "hello" and len(services.hub.clients) == 1

"""LLM agent loop against a fake Ollama HTTP server (real streaming over TCP)."""

import asyncio
import json
import socket
import threading
import time

import pytest
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def make_fake_ollama(mode: str) -> FastAPI:
    app = FastAPI()
    app.state.requests = []

    @app.get("/api/tags")
    async def tags():
        return {"models": [{"name": "qwen2.5:7b", "size": 1, "details": {"family": "qwen2", "parameter_size": "7B"}}]}

    @app.post("/api/show")
    async def show():
        return {"capabilities": ["completion", "tools"]}

    @app.post("/api/chat")
    async def chat(request: Request):
        body = await request.json()
        app.state.requests.append(body)
        if mode == "no_tools" and body.get("tools"):
            return JSONResponse({"error": "registry.ollama.ai/library/x does not support tools"}, status_code=400)
        has_tool_result = any(m["role"] == "tool" for m in body["messages"])

        def gen():
            if mode == "tools" and not has_tool_result:
                yield json.dumps({"message": {"role": "assistant", "content": "",
                                              "tool_calls": [{"function": {"name": "system_status",
                                                                           "arguments": {"focus": "cpu"}}}]},
                                  "done": False}) + "\n"
                yield json.dumps({"message": {"role": "assistant", "content": ""}, "done": True}) + "\n"
                return
            for piece in ["O sistema ", "está estável. ", "Mais alguma coisa?"]:
                yield json.dumps({"message": {"role": "assistant", "content": piece}, "done": False}) + "\n"
            yield json.dumps({"message": {"role": "assistant", "content": ""}, "done": True, "eval_count": 9}) + "\n"

        return StreamingResponse(gen(), media_type="application/x-ndjson")

    return app


@pytest.fixture
def fake_ollama(request):
    mode = getattr(request, "param", "tools")
    port = _free_port()
    app = make_fake_ollama(mode)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error"))
    th = threading.Thread(target=server.run, daemon=True)
    th.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}", app
    server.should_exit = True
    th.join(timeout=5)


async def test_agent_uses_tool_then_answers(services, recorder, fake_ollama):
    host, app = fake_ollama
    await services.settings.update({"ai": {"provider": "ollama", "ollama_host": host, "model": ""}})
    await services.core.handle("Me dê um panorama rápido da máquina, por favor")
    assert recorder.named("ai.tool_call")[0]["tool"] == "system_status"
    assert recorder.responses()[-1] == "O sistema está estável. Mais alguma coisa?"
    deltas = "".join(d["text"] for d in recorder.named("ai.delta"))
    assert deltas == "O sistema está estável. Mais alguma coisa?"
    # second request carried the tool result back to the model
    second = app.state.requests[1]
    tool_msgs = [m for m in second["messages"] if m["role"] == "tool"]
    assert tool_msgs and json.loads(tool_msgs[0]["content"])["ok"] is True
    # auto-picked a tool-capable installed model and exposed registry tools
    assert second["model"] == "qwen2.5:7b"
    names = {t["function"]["name"] for t in app.state.requests[0]["tools"]}
    assert {"open_application", "search_files", "create_note"} <= names
    # a task was recorded for the tool-using turn
    assert any(t["status"] == "completed" for t in recorder.named("task.updated"))


@pytest.mark.parametrize("fake_ollama", ["no_tools"], indirect=True)
async def test_agent_falls_back_without_tools(services, recorder, fake_ollama):
    host, _ = fake_ollama
    await services.settings.update({"ai": {"ollama_host": host, "model": "qwen2.5:7b"}})
    await services.core.handle("Conte uma curiosidade")
    assert recorder.responses()[-1].startswith("O sistema")


async def test_denied_tools_hidden_from_llm(services, fake_ollama):
    host, app = fake_ollama
    await services.settings.update({"ai": {"ollama_host": host}})
    services.permissions.set_policy(services.registry.get("open_application"), "deny")
    await services.core.handle("Faça um diagnóstico geral")
    names = {t["function"]["name"] for t in app.state.requests[0]["tools"]}
    assert "open_application" not in names
    assert "ui_click" not in names  # computer control is opt-in


async def test_external_provider_requires_consent(services, recorder, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    await services.settings.update({"ai": {"provider": "openai"}})
    await services.core.handle("Olá, tudo bem com você hoje?")
    assert "autorize o envio de dados" in recorder.responses()[-1]
    await asyncio.sleep(0)

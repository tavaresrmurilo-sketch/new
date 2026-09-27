"""Provider adapters: request shape + streaming parsers, using httpx.MockTransport (no network)."""

import json

import httpx
import pytest

from jarvis_engine.providers import base as pbase
from jarvis_engine.providers.base import ChatMessage, ToolCall
from jarvis_engine.providers.cloud import AnthropicProvider, GeminiProvider, OpenAIProvider

TOOLS = [{"name": "open_application", "description": "Abre app",
          "parameters": {"type": "object", "properties": {"name": {"type": "string", "minimum": 1}},
                         "required": ["name"]}}]


def sse(events: list[dict | str]) -> bytes:
    out = []
    for e in events:
        out.append("data: " + (e if isinstance(e, str) else json.dumps(e)) + "\n\n")
    return "".join(out).encode()


@pytest.fixture
def patch_client(monkeypatch):
    captured = {}

    def install(body: bytes, status: int = 200):
        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            captured["json"] = json.loads(request.content or b"{}")
            return httpx.Response(status, content=body, headers={"content-type": "text/event-stream"})

        def client(self, timeout=None):
            return httpx.AsyncClient(transport=httpx.MockTransport(handler))

        monkeypatch.setattr(pbase.AIProvider, "_client", client)
        return captured

    return install


async def test_openai_stream_tool_calls(patch_client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    cap = patch_client(sse([
        {"choices": [{"delta": {"content": "Abrindo"}}]},
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call_1",
                                                "function": {"name": "open_application", "arguments": "{\"na"}}]}}]},
        {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "me\": \"Spotify\"}"}}]}}]},
        "[DONE]",
    ]))
    p = OpenAIProvider("gpt-test")
    res = await p.chat([ChatMessage("user", "abra o spotify")], TOOLS)
    assert res.text == "Abrindo"
    assert res.tool_calls[0].name == "open_application" and res.tool_calls[0].arguments == {"name": "Spotify"}
    assert cap["headers"]["authorization"] == "Bearer sk-test"
    assert cap["json"]["tools"][0]["function"]["name"] == "open_application"


async def test_anthropic_stream(patch_client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant")
    cap = patch_client(sse([
        {"type": "message_start"},
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text"}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Certo."}},
        {"type": "content_block_stop", "index": 0},
        {"type": "content_block_start", "index": 1,
         "content_block": {"type": "tool_use", "id": "toolu_1", "name": "open_application"}},
        {"type": "content_block_delta", "index": 1,
         "delta": {"type": "input_json_delta", "partial_json": "{\"name\":\"Chrome\"}"}},
        {"type": "content_block_stop", "index": 1},
        {"type": "message_stop"},
    ]))
    p = AnthropicProvider("claude-test")
    msgs = [ChatMessage("system", "sys"), ChatMessage("user", "abra o chrome"),
            ChatMessage("assistant", "", tool_calls=[ToolCall("toolu_0", "system_status", {})]),
            ChatMessage("tool", '{"ok":true}', tool_call_id="toolu_0", name="system_status")]
    res = await p.chat(msgs, TOOLS)
    assert res.text == "Certo." and res.tool_calls[0].arguments == {"name": "Chrome"}
    body = cap["json"]
    assert body["system"] == "sys" and cap["headers"]["anthropic-version"] == "2023-06-01"
    assert body["messages"][-1]["content"][0]["type"] == "tool_result"
    assert body["tools"][0]["input_schema"]["required"] == ["name"]


async def test_gemini_stream_and_schema(patch_client, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "g-key")
    cap = patch_client(sse([
        {"candidates": [{"content": {"parts": [{"text": "Ok"}]}}]},
        {"candidates": [{"content": {"parts": [{"functionCall": {"name": "open_application",
                                                                 "args": {"name": "Spotify"}}}]}}]},
    ]))
    p = GeminiProvider("gemini-test")
    res = await p.chat([ChatMessage("user", "abra")], TOOLS)
    assert res.text == "Ok" and res.tool_calls[0].arguments == {"name": "Spotify"}
    decl = cap["json"]["tools"][0]["functionDeclarations"][0]["parameters"]
    assert decl["type"] == "OBJECT" and "minimum" not in decl["properties"]["name"]
    assert cap["headers"]["x-goog-api-key"] == "g-key"


async def test_missing_key_is_friendly():
    h = await OpenAIProvider().health_check()
    assert not h.ok and ".env.local" in h.detail


async def test_http_errors_are_translated(patch_client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-bad")
    patch_client(b'{"error":"bad key"}', status=401)
    with pytest.raises(pbase.ProviderError) as exc:
        await OpenAIProvider().chat([ChatMessage("user", "x")])
    assert "chave de API" in str(exc.value)

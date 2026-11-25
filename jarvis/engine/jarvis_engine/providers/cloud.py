"""Optional cloud providers: OpenAI, Anthropic and Google Gemini.

Keys come only from the environment (.env.local). None of these is required
for Jarvis to start, and they are only used after the user consents in
Settings › Privacy to send data to an external provider.
"""

from __future__ import annotations

import os
import secrets
from typing import Any, AsyncIterator

import httpx

from .base import (AIProvider, ChatMessage, Health, ProviderError, StreamEvent, ToolCall, http_error, iter_sse,
                   parse_json_args)


def _require_key(env: str, label: str) -> str:
    key = os.environ.get(env, "").strip()
    if not key:
        raise ProviderError(f"{label}: configure {env} no arquivo .env.local.")
    return key


# =================================================================== OpenAI
class OpenAIProvider(AIProvider):
    name = "openai"
    label = "OpenAI"
    default_model = "gpt-4.1-mini"
    base_url = "https://api.openai.com/v1"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {_require_key('OPENAI_API_KEY', self.label)}"}

    @staticmethod
    def _messages(messages: list[ChatMessage]) -> list[dict[str, Any]]:
        import json

        out: list[dict[str, Any]] = []
        for m in messages:
            if m.role == "tool":
                out.append({"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content})
                continue
            msg: dict[str, Any] = {"role": m.role}
            if m.images:
                msg["content"] = [{"type": "text", "text": m.content}] + [
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}} for img in m.images]
            else:
                msg["content"] = m.content
            if m.tool_calls:
                msg["tool_calls"] = [{"id": c.id, "type": "function",
                                      "function": {"name": c.name, "arguments": json.dumps(c.arguments)}}
                                     for c in m.tool_calls]
            out.append(msg)
        return out

    async def stream(self, messages: list[ChatMessage], tools: list[dict[str, Any]] | None = None,
                     temperature: float = 0.4, max_tokens: int = 1024) -> AsyncIterator[StreamEvent]:
        body: dict[str, Any] = {"model": self.model, "messages": self._messages(messages), "stream": True,
                                "temperature": temperature, "max_tokens": max_tokens,
                                "stream_options": {"include_usage": True}}
        if tools:
            body["tools"] = [{"type": "function", "function": t} for t in tools]
        pending: dict[int, dict[str, Any]] = {}
        usage: dict[str, Any] = {}
        try:
            async with self._client() as client:
                async with client.stream("POST", f"{self.base_url}/chat/completions", json=body,
                                         headers=self._headers()) as resp:
                    if resp.status_code >= 400:
                        await resp.aread()
                        resp.raise_for_status()
                    async for chunk in iter_sse(resp):
                        if chunk.get("usage"):
                            usage = chunk["usage"]
                        for choice in chunk.get("choices") or []:
                            delta = choice.get("delta") or {}
                            if delta.get("content"):
                                yield StreamEvent("text", text=delta["content"])
                            for tc in delta.get("tool_calls") or []:
                                slot = pending.setdefault(tc.get("index", 0), {"id": "", "name": "", "args": ""})
                                slot["id"] = tc.get("id") or slot["id"]
                                fn = tc.get("function") or {}
                                slot["name"] += fn.get("name") or ""
                                slot["args"] += fn.get("arguments") or ""
        except httpx.HTTPError as exc:
            raise http_error(self.label, exc) from exc
        for idx in sorted(pending):
            slot = pending[idx]
            yield StreamEvent("tool_call", tool_call=ToolCall(slot["id"] or "call_" + secrets.token_hex(4),
                                                              slot["name"], parse_json_args(slot["args"])))
        yield StreamEvent("done", usage=usage)

    async def health_check(self) -> Health:
        try:
            headers = self._headers()
        except ProviderError as exc:
            return Health(False, str(exc))
        try:
            async with self._client(timeout=8) as client:
                r = await client.get(f"{self.base_url}/models", headers=headers)
                r.raise_for_status()
        except httpx.HTTPError as exc:
            return Health(False, str(http_error(self.label, exc)))
        ids = sorted(m["id"] for m in r.json().get("data", []) if str(m.get("id", "")).startswith(("gpt", "o", "chatgpt")))
        return Health(True, f"OpenAI online ({len(ids)} modelos).", [{"name": i} for i in ids])

    async def embeddings(self, texts: list[str]) -> list[list[float]]:
        try:
            async with self._client(timeout=60) as client:
                r = await client.post(f"{self.base_url}/embeddings", headers=self._headers(),
                                      json={"model": "text-embedding-3-small", "input": texts})
                r.raise_for_status()
        except httpx.HTTPError as exc:
            raise http_error(self.label, exc) from exc
        return [d["embedding"] for d in r.json().get("data", [])]

    async def transcribe(self, wav_bytes: bytes, language: str | None = None) -> str:
        data = {"model": "whisper-1"}
        if language:
            data["language"] = language.split("-")[0]
        try:
            async with self._client(timeout=60) as client:
                r = await client.post(f"{self.base_url}/audio/transcriptions", headers=self._headers(), data=data,
                                      files={"file": ("audio.wav", wav_bytes, "audio/wav")})
                r.raise_for_status()
        except httpx.HTTPError as exc:
            raise http_error(self.label, exc) from exc
        return str(r.json().get("text", ""))


# ================================================================ Anthropic
class AnthropicProvider(AIProvider):
    name = "anthropic"
    label = "Anthropic"
    default_model = "claude-sonnet-5"
    base_url = "https://api.anthropic.com/v1"

    def _headers(self) -> dict[str, str]:
        return {"x-api-key": _require_key("ANTHROPIC_API_KEY", self.label), "anthropic-version": "2023-06-01"}

    @staticmethod
    def _split(messages: list[ChatMessage]) -> tuple[str, list[dict[str, Any]]]:
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        out: list[dict[str, Any]] = []
        for m in messages:
            if m.role == "system":
                continue
            if m.role == "tool":
                block = {"type": "tool_result", "tool_use_id": m.tool_call_id, "content": m.content}
                if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list) and \
                        all(b.get("type") == "tool_result" for b in out[-1]["content"]):
                    out[-1]["content"].append(block)
                else:
                    out.append({"role": "user", "content": [block]})
                continue
            blocks: list[dict[str, Any]] = []
            for img in m.images:
                blocks.append({"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img}})
            if m.content:
                blocks.append({"type": "text", "text": m.content})
            for c in m.tool_calls:
                blocks.append({"type": "tool_use", "id": c.id, "name": c.name, "input": c.arguments})
            if not blocks:
                blocks.append({"type": "text", "text": "…"})
            out.append({"role": m.role, "content": blocks})
        return system, out

    async def stream(self, messages: list[ChatMessage], tools: list[dict[str, Any]] | None = None,
                     temperature: float = 0.4, max_tokens: int = 1024) -> AsyncIterator[StreamEvent]:
        system, msgs = self._split(messages)
        body: dict[str, Any] = {"model": self.model, "max_tokens": max_tokens, "messages": msgs, "stream": True,
                                "temperature": min(1.0, temperature)}
        if system:
            body["system"] = system
        if tools:
            body["tools"] = [{"name": t["name"], "description": t["description"], "input_schema": t["parameters"]}
                             for t in tools]
        blocks: dict[int, dict[str, Any]] = {}
        usage: dict[str, Any] = {}
        try:
            async with self._client() as client:
                async with client.stream("POST", f"{self.base_url}/messages", json=body,
                                         headers=self._headers()) as resp:
                    if resp.status_code >= 400:
                        await resp.aread()
                        resp.raise_for_status()
                    async for ev in iter_sse(resp):
                        t = ev.get("type")
                        if t == "content_block_start":
                            cb = ev.get("content_block") or {}
                            blocks[ev.get("index", 0)] = {"type": cb.get("type"), "id": cb.get("id"),
                                                          "name": cb.get("name"), "json": ""}
                        elif t == "content_block_delta":
                            d = ev.get("delta") or {}
                            if d.get("type") == "text_delta":
                                yield StreamEvent("text", text=d.get("text", ""))
                            elif d.get("type") == "input_json_delta":
                                blocks.setdefault(ev.get("index", 0), {"json": ""})["json"] += d.get("partial_json", "")
                        elif t == "content_block_stop":
                            b = blocks.get(ev.get("index", 0))
                            if b and b.get("type") == "tool_use":
                                yield StreamEvent("tool_call", tool_call=ToolCall(
                                    b.get("id") or "toolu_" + secrets.token_hex(4), b.get("name") or "",
                                    parse_json_args(b.get("json"))))
                        elif t == "message_delta":
                            usage = ev.get("usage") or usage
                        elif t == "error":
                            err = ev.get("error") or {}
                            raise ProviderError(f"Anthropic: {err.get('message', 'erro')}", str(err))
        except httpx.HTTPError as exc:
            raise http_error(self.label, exc) from exc
        yield StreamEvent("done", usage=usage)

    async def health_check(self) -> Health:
        try:
            headers = self._headers()
        except ProviderError as exc:
            return Health(False, str(exc))
        try:
            async with self._client(timeout=8) as client:
                r = await client.get(f"{self.base_url}/models", headers=headers)
                r.raise_for_status()
        except httpx.HTTPError as exc:
            return Health(False, str(http_error(self.label, exc)))
        ids = [m["id"] for m in r.json().get("data", [])]
        return Health(True, f"Anthropic online ({len(ids)} modelos).", [{"name": i} for i in ids])


# =================================================================== Gemini
_GEMINI_SCHEMA_KEYS = {"type", "description", "enum", "properties", "required", "items", "nullable", "format"}


def _gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in schema.items():
        if k not in _GEMINI_SCHEMA_KEYS:
            continue
        if k == "properties":
            out[k] = {name: _gemini_schema(p) for name, p in v.items()}
        elif k == "items":
            out[k] = _gemini_schema(v)
        elif k == "type":
            out[k] = str(v).upper()
        else:
            out[k] = v
    return out


class GeminiProvider(AIProvider):
    name = "gemini"
    label = "Google Gemini"
    default_model = "gemini-2.5-flash"
    base_url = "https://generativelanguage.googleapis.com/v1beta"

    def _headers(self) -> dict[str, str]:
        return {"x-goog-api-key": _require_key("GEMINI_API_KEY", self.label)}

    @staticmethod
    def _contents(messages: list[ChatMessage]) -> tuple[str, list[dict[str, Any]]]:
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        contents: list[dict[str, Any]] = []
        for m in messages:
            if m.role == "system":
                continue
            if m.role == "tool":
                part = {"functionResponse": {"name": m.name or "tool", "response": {"result": m.content}}}
                if contents and contents[-1]["role"] == "user" and "functionResponse" in contents[-1]["parts"][0]:
                    contents[-1]["parts"].append(part)
                else:
                    contents.append({"role": "user", "parts": [part]})
                continue
            parts: list[dict[str, Any]] = []
            for img in m.images:
                parts.append({"inlineData": {"mimeType": "image/png", "data": img}})
            if m.content:
                parts.append({"text": m.content})
            for c in m.tool_calls:
                parts.append({"functionCall": {"name": c.name, "args": c.arguments}})
            contents.append({"role": "model" if m.role == "assistant" else "user", "parts": parts or [{"text": "…"}]})
        return system, contents

    async def stream(self, messages: list[ChatMessage], tools: list[dict[str, Any]] | None = None,
                     temperature: float = 0.4, max_tokens: int = 1024) -> AsyncIterator[StreamEvent]:
        system, contents = self._contents(messages)
        body: dict[str, Any] = {"contents": contents,
                                "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens}}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        if tools:
            body["tools"] = [{"functionDeclarations": [
                {"name": t["name"], "description": t["description"], "parameters": _gemini_schema(t["parameters"])}
                for t in tools]}]
        url = f"{self.base_url}/models/{self.model}:streamGenerateContent?alt=sse"
        usage: dict[str, Any] = {}
        try:
            async with self._client() as client:
                async with client.stream("POST", url, json=body, headers=self._headers()) as resp:
                    if resp.status_code >= 400:
                        await resp.aread()
                        resp.raise_for_status()
                    async for chunk in iter_sse(resp):
                        usage = chunk.get("usageMetadata") or usage
                        for cand in chunk.get("candidates") or []:
                            for part in (cand.get("content") or {}).get("parts") or []:
                                if part.get("text"):
                                    yield StreamEvent("text", text=part["text"])
                                if part.get("functionCall"):
                                    fc = part["functionCall"]
                                    yield StreamEvent("tool_call", tool_call=ToolCall(
                                        "call_" + secrets.token_hex(4), fc.get("name", ""),
                                        parse_json_args(fc.get("args"))))
        except httpx.HTTPError as exc:
            raise http_error(self.label, exc) from exc
        yield StreamEvent("done", usage=usage)

    async def health_check(self) -> Health:
        try:
            headers = self._headers()
        except ProviderError as exc:
            return Health(False, str(exc))
        try:
            async with self._client(timeout=8) as client:
                r = await client.get(f"{self.base_url}/models", headers=headers)
                r.raise_for_status()
        except httpx.HTTPError as exc:
            return Health(False, str(http_error(self.label, exc)))
        names = [m["name"].removeprefix("models/") for m in r.json().get("models", [])
                 if "generateContent" in (m.get("supportedGenerationMethods") or [])]
        return Health(True, f"Gemini online ({len(names)} modelos).", [{"name": n} for n in names])

    async def embeddings(self, texts: list[str]) -> list[list[float]]:
        body = {"requests": [{"model": "models/text-embedding-004", "content": {"parts": [{"text": t}]}} for t in texts]}
        try:
            async with self._client(timeout=60) as client:
                r = await client.post(f"{self.base_url}/models/text-embedding-004:batchEmbedContents",
                                      headers=self._headers(), json=body)
                r.raise_for_status()
        except httpx.HTTPError as exc:
            raise http_error(self.label, exc) from exc
        return [e["values"] for e in r.json().get("embeddings", [])]

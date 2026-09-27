"""Ollama provider (local, default). Never downloads models on its own."""

from __future__ import annotations

import ipaddress
import json
import secrets
from typing import Any, AsyncIterator
from urllib.parse import urlparse

import httpx

from .base import (AIProvider, ChatMessage, Health, ProviderError, StreamEvent, ToolCall, ToolsNotSupported,
                   http_error, parse_json_args)

# Families known to handle function calling well, in order of preference.
TOOL_FAMILIES = ("qwen3", "qwen2.5", "llama3.3", "llama3.2", "llama3.1", "mistral-nemo", "mistral", "command-r",
                 "granite3", "hermes3", "gpt-oss", "firefunction")
VISION_HINTS = ("llava", "vision", "qwen2.5vl", "qwen2-vl", "gemma3", "minicpm-v", "moondream", "bakllava",
                "llama4", "mistral-small3.1")


def _is_loopback(host: str) -> bool:
    name = (urlparse(host).hostname or "").lower()
    if name == "localhost":
        return True
    try:
        return ipaddress.ip_address(name).is_loopback
    except ValueError:
        return False


class OllamaProvider(AIProvider):
    name = "ollama"

    def __init__(self, host: str = "http://localhost:11434", model: str = "", context_window: int = 8192) -> None:
        super().__init__(model)
        self.host = host.rstrip("/")
        self.context_window = context_window
        self._capabilities: dict[str, list[str]] = {}

    @property
    def is_external(self) -> bool:  # type: ignore[override]
        # An Ollama server on another machine receives prompts, files and screenshots:
        # it needs the same consent as a cloud provider.
        return not _is_loopback(self.host)

    @property
    def label(self) -> str:  # type: ignore[override]
        return "Ollama (remoto)" if self.is_external else "Ollama (local)"

    def _messages(self, messages: list[ChatMessage]) -> list[dict[str, Any]]:
        out = []
        for m in messages:
            msg: dict[str, Any] = {"role": m.role, "content": m.content}
            if m.images:
                msg["images"] = m.images
            if m.tool_calls:
                msg["tool_calls"] = [{"function": {"name": c.name, "arguments": c.arguments}} for c in m.tool_calls]
            if m.role == "tool" and m.name:
                msg["tool_name"] = m.name
            out.append(msg)
        return out

    async def stream(self, messages: list[ChatMessage], tools: list[dict[str, Any]] | None = None,
                     temperature: float = 0.4, max_tokens: int = 1024) -> AsyncIterator[StreamEvent]:
        if not self.model:
            self.model = await self.pick_default_model()
        body: dict[str, Any] = {
            "model": self.model,
            "messages": self._messages(messages),
            "stream": True,
            "options": {"temperature": temperature, "num_ctx": self.context_window, "num_predict": max_tokens},
        }
        if tools:
            body["tools"] = [{"type": "function", "function": t} for t in tools]
        try:
            async with self._client() as client:
                async with client.stream("POST", f"{self.host}/api/chat", json=body) as resp:
                    if resp.status_code >= 400:
                        text = (await resp.aread()).decode("utf-8", errors="replace")
                        err = _error_text(text)
                        if "does not support tools" in err:
                            raise ToolsNotSupported(f"O modelo {self.model} não suporta ferramentas.", err, 400)
                        if resp.status_code == 404 or "not found" in err:
                            raise ProviderError(f"O modelo '{self.model}' não está instalado no Ollama.", err, 404)
                        raise ProviderError(f"Ollama respondeu com erro: {err[:200]}", err, resp.status_code)
                    usage: dict[str, Any] = {}
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except ValueError:
                            continue
                        if chunk.get("error"):
                            raise ProviderError(f"Ollama: {chunk['error']}", chunk["error"])
                        msg = chunk.get("message") or {}
                        if msg.get("content"):
                            yield StreamEvent("text", text=msg["content"])
                        for call in msg.get("tool_calls") or []:
                            fn = call.get("function") or {}
                            yield StreamEvent("tool_call", tool_call=ToolCall(
                                id=call.get("id") or "call_" + secrets.token_hex(4), name=fn.get("name", ""),
                                arguments=parse_json_args(fn.get("arguments"))))
                        if chunk.get("done"):
                            usage = {"prompt_tokens": chunk.get("prompt_eval_count"),
                                     "completion_tokens": chunk.get("eval_count")}
                    yield StreamEvent("done", usage=usage)
        except ProviderError:
            raise
        except httpx.HTTPError as exc:
            raise http_error("Ollama", exc) from exc

    async def health_check(self) -> Health:
        try:
            async with self._client(timeout=4) as client:
                r = await client.get(f"{self.host}/api/tags")
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError:
            return Health(False, "O modelo local não está disponível (Ollama não respondeu em "
                                 f"{self.host}).")
        models = [{"name": m.get("name"), "size": m.get("size"),
                   "family": (m.get("details") or {}).get("family"),
                   "parameters": (m.get("details") or {}).get("parameter_size")} for m in data.get("models", [])]
        if not models:
            return Health(False, "Ollama está rodando, mas nenhum modelo está instalado. Ex.: 'ollama pull qwen2.5:7b'.",
                          [])
        if self.model and not any(m["name"] == self.model or m["name"].split(":")[0] == self.model for m in models):
            return Health(False, f"O modelo '{self.model}' não está instalado no Ollama.", models)
        return Health(True, f"Ollama online com {len(models)} modelo(s).", models)

    async def capabilities(self, model: str) -> list[str]:
        if model in self._capabilities:
            return self._capabilities[model]
        caps: list[str] = []
        try:
            async with self._client(timeout=5) as client:
                r = await client.post(f"{self.host}/api/show", json={"model": model})
                if r.status_code == 200:
                    caps = list(r.json().get("capabilities") or [])
        except httpx.HTTPError:
            caps = []
        self._capabilities[model] = caps
        return caps

    async def pick_default_model(self) -> str:
        health = await self.health_check()
        names = [m["name"] for m in health.models if m.get("name")]
        if not names:
            raise ProviderError(health.detail)
        for fam in TOOL_FAMILIES:
            for n in names:
                if n.startswith(fam):
                    return n
        for n in names:
            if "tools" in await self.capabilities(n):
                return n
        return names[0]

    async def find_vision_model(self) -> str | None:
        health = await self.health_check()
        names = [m["name"] for m in health.models if m.get("name")]
        for n in names:
            if "vision" in await self.capabilities(n):
                return n
        for n in names:
            if any(h in n for h in VISION_HINTS):
                return n
        return None

    def supports_vision(self, model: str | None = None) -> bool:
        m = (model or self.model or "").lower()
        return "vision" in self._capabilities.get(m, []) or any(h in m for h in VISION_HINTS)

    async def embeddings(self, texts: list[str]) -> list[list[float]]:
        model = self.model or await self.pick_default_model()
        try:
            async with self._client(timeout=60) as client:
                r = await client.post(f"{self.host}/api/embed", json={"model": model, "input": texts})
                r.raise_for_status()
                return r.json().get("embeddings", [])
        except httpx.HTTPError as exc:
            raise http_error("Ollama", exc) from exc


def _error_text(body: str) -> str:
    try:
        return str(json.loads(body).get("error", body))
    except ValueError:
        return body

"""AIProvider abstraction: chat(), stream(), vision(), embeddings(), health_check()."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal

import httpx

Role = Literal["system", "user", "assistant", "tool"]


class ProviderError(RuntimeError):
    """User-facing provider failure (pt-BR message)."""

    def __init__(self, message: str, detail: str = "", status: int | None = None) -> None:
        super().__init__(message)
        self.detail = detail
        self.status = status


class ToolsNotSupported(ProviderError):
    pass


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ChatMessage:
    role: Role
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str | None = None
    name: str | None = None
    images: list[str] = field(default_factory=list)  # base64 PNG/JPEG without data: prefix


@dataclass
class ChatResult:
    text: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict[str, Any] = field(default_factory=dict)


@dataclass
class StreamEvent:
    type: Literal["text", "tool_call", "done"]
    text: str = ""
    tool_call: ToolCall | None = None
    usage: dict[str, Any] = field(default_factory=dict)


@dataclass
class Health:
    ok: bool
    detail: str
    models: list[dict[str, Any]] = field(default_factory=list)


class AIProvider(ABC):
    name: str = "base"
    label: str = "Base"
    is_external: bool = True
    default_model: str = ""

    def __init__(self, model: str = "", timeout: float = 120.0) -> None:
        self.model = model or self.default_model
        self.timeout = timeout

    def _client(self, timeout: float | None = None) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=httpx.Timeout(timeout or self.timeout, connect=5.0))

    # --- required -------------------------------------------------------
    @abstractmethod
    def stream(self, messages: list[ChatMessage], tools: list[dict[str, Any]] | None = None,
               temperature: float = 0.4, max_tokens: int = 1024) -> AsyncIterator[StreamEvent]: ...

    @abstractmethod
    async def health_check(self) -> Health: ...

    # --- derived ----------------------------------------------------------
    async def chat(self, messages: list[ChatMessage], tools: list[dict[str, Any]] | None = None,
                   temperature: float = 0.4, max_tokens: int = 1024) -> ChatResult:
        text: list[str] = []
        calls: list[ToolCall] = []
        usage: dict[str, Any] = {}
        async for ev in self.stream(messages, tools, temperature, max_tokens):
            if ev.type == "text":
                text.append(ev.text)
            elif ev.type == "tool_call" and ev.tool_call:
                calls.append(ev.tool_call)
            elif ev.type == "done":
                usage = ev.usage
        return ChatResult("".join(text), calls, usage)

    async def vision(self, prompt: str, image_b64: str, model: str | None = None) -> str:
        previous = self.model
        if model:
            self.model = model
        try:
            res = await self.chat([ChatMessage("user", prompt, images=[image_b64])], max_tokens=800)
        finally:
            self.model = previous
        return res.text

    async def embeddings(self, texts: list[str]) -> list[list[float]]:
        raise ProviderError(f"{self.label} não oferece embeddings neste adaptador.")

    async def list_models(self) -> list[dict[str, Any]]:
        return (await self.health_check()).models

    def supports_vision(self, model: str | None = None) -> bool:
        return True


# ------------------------------------------------------------- helpers --
async def iter_sse(response: httpx.Response) -> AsyncIterator[dict[str, Any]]:
    """Parse a Server-Sent Events stream into JSON payloads (ignores [DONE] and comments)."""
    data_lines: list[str] = []
    async for line in response.aiter_lines():
        if not line:
            if data_lines:
                raw = "\n".join(data_lines)
                data_lines = []
                if raw.strip() == "[DONE]":
                    return
                try:
                    yield json.loads(raw)
                except ValueError:
                    continue
            continue
        if line.startswith(":"):
            continue
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    if data_lines:
        raw = "\n".join(data_lines)
        if raw.strip() != "[DONE]":
            try:
                yield json.loads(raw)
            except ValueError:
                return


def http_error(provider: str, exc: Exception) -> ProviderError:
    if isinstance(exc, httpx.ConnectError):
        return ProviderError(f"Não consegui conectar ao {provider}.", str(exc))
    if isinstance(exc, httpx.TimeoutException):
        return ProviderError(f"O {provider} demorou demais para responder.", str(exc))
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        msg = {401: "chave de API inválida ou ausente", 403: "acesso negado pela API",
               404: "modelo não encontrado", 429: "limite de uso atingido"}.get(status, f"erro HTTP {status}")
        return ProviderError(f"{provider}: {msg}.", exc.response.text[:500], status)
    return ProviderError(f"Falha ao falar com o {provider}.", str(exc))


def parse_json_args(raw: str | dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except ValueError:
        return {}

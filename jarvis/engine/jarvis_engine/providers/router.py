"""ProviderRouter: selects the configured AI provider and enforces privacy consent."""

from __future__ import annotations

import time
from typing import Any

from ..activity import ActivityLog, Category
from ..eventbus import EventBus
from ..settings import SettingsManager
from .base import AIProvider, ChatMessage, Health, ProviderError
from .cloud import AnthropicProvider, GeminiProvider, OpenAIProvider
from .ollama import OllamaProvider

PROVIDER_LABELS = {"ollama": "Ollama (local)", "openai": "OpenAI", "anthropic": "Anthropic", "gemini": "Google Gemini",
                   "none": "Nenhum (somente comandos locais)"}


class ProviderRouter:
    HEALTH_TTL_S = 20.0

    def __init__(self, settings: SettingsManager, bus: EventBus, activity: ActivityLog) -> None:
        self.settings = settings
        self.bus = bus
        self.activity = activity
        self._health: dict[str, tuple[float, Health]] = {}
        self._vision_cache: tuple[float, str | None] = (0.0, None)

    # ----------------------------------------------------------- building
    def build(self, name: str | None = None, model: str | None = None) -> AIProvider | None:
        ai = self.settings.ai
        name = name or ai.provider
        model = ai.model if model is None and name == ai.provider else (model or "")
        if name == "ollama":
            return OllamaProvider(ai.ollama_host, model, ai.context_window)
        if name == "openai":
            return OpenAIProvider(model)
        if name == "anthropic":
            return AnthropicProvider(model)
        if name == "gemini":
            return GeminiProvider(model)
        return None

    def _consent_ok(self, provider: AIProvider) -> bool:
        return not provider.is_external or self.settings.privacy.external_provider_consent

    def active(self) -> AIProvider:
        provider = self.build()
        if provider is None:
            raise ProviderError("Nenhum provedor de IA configurado.")
        if not self._consent_ok(provider):
            raise ProviderError(f"Para usar {provider.label}, autorize o envio de dados a provedores externos em "
                                "Configurações › Privacidade.")
        return provider

    async def health(self, name: str | None = None, force: bool = False) -> Health:
        name = name or self.settings.ai.provider
        cached = self._health.get(name)
        if cached and not force and time.time() - cached[0] < self.HEALTH_TTL_S:
            return cached[1]
        provider = self.build(name)
        if provider is None:
            h = Health(False, "Nenhum provedor de IA selecionado; apenas comandos locais funcionam.")
        else:
            try:
                h = await provider.health_check()
            except Exception as exc:  # defensive: health must never raise
                h = Health(False, f"Falha ao verificar {provider.label}: {exc}")
        self._health[name] = (time.time(), h)
        return h

    async def active_or_none(self) -> AIProvider | None:
        try:
            provider = self.active()
        except ProviderError:
            return None
        return provider if (await self.health()).ok else None

    async def vision_or_none(self) -> AIProvider | None:
        provider = await self.active_or_none()
        if provider is None:
            return None
        ai = self.settings.ai
        if isinstance(provider, OllamaProvider):
            model = ai.vision_model
            if not model:
                ts, cached = self._vision_cache
                if time.time() - ts < 60:
                    model = cached
                else:
                    model = await provider.find_vision_model()
                    self._vision_cache = (time.time(), model)
            if not model:
                return None
            vp = OllamaProvider(ai.ollama_host, model, ai.context_window)
            return vp
        if ai.vision_model:
            provider.model = ai.vision_model
        return provider

    # ------------------------------------------------------------- calls
    async def note_external(self, provider: AIProvider, purpose: str) -> None:
        if provider.is_external:
            await self.bus.publish("privacy.external", {"provider": provider.label, "purpose": purpose,
                                                        "ts": time.time()})
            self.activity.log(Category.AI, f"Dados enviados para {provider.label} ({purpose})")

    async def complete(self, prompt: str, max_tokens: int = 600, system: str | None = None) -> str:
        provider = self.active()
        await self.note_external(provider, "completion")
        msgs = ([ChatMessage("system", system)] if system else []) + [ChatMessage("user", prompt)]
        res = await provider.chat(msgs, temperature=self.settings.ai.temperature, max_tokens=max_tokens)
        return res.text

    async def vision(self, prompt: str, image_b64: str) -> str:
        provider = await self.vision_or_none()
        if provider is None:
            raise ProviderError("Nenhum modelo com visão disponível.")
        await self.note_external(provider, "vision")
        return await provider.vision(prompt, image_b64)

    async def status(self, force: bool = False) -> dict[str, Any]:
        ai = self.settings.ai
        h = await self.health(force=force)
        provider = self.build()
        model = ai.model
        if not model and isinstance(provider, OllamaProvider) and h.ok:
            try:
                model = await provider.pick_default_model()
            except ProviderError:
                model = ""
        elif not model and provider is not None:
            model = provider.default_model
        return {
            "provider": ai.provider,
            "label": PROVIDER_LABELS.get(ai.provider, ai.provider),
            "model": model,
            "ok": h.ok,
            "detail": h.detail,
            "models": h.models,
            "external": bool(provider and provider.is_external),
            "consent": self.settings.privacy.external_provider_consent,
        }

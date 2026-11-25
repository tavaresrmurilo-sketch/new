"""Typed, validated, persisted settings.

Each section is a pydantic model; the whole document is stored as one JSON row
per section in the `settings` table. Unknown keys are rejected so the UI can
never write garbage into the engine configuration.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from .db import Database, dumps, loads, now
from .eventbus import EventBus


class _Section(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


class GeneralSettings(_Section):
    user_name: str = Field(default="", max_length=60)
    assistant_name: str = Field(default="Jarvis", min_length=1, max_length=30)
    language: Literal["pt-BR", "en-US"] = "pt-BR"
    onboarding_complete: bool = False


class VoiceSettings(_Section):
    enabled: bool = True
    input_device_id: str = "default"
    output_device_id: str = "default"
    wake_word_enabled: bool = True
    wake_word: str = Field(default="jarvis", min_length=2, max_length=30)
    wake_engine: Literal["whisper", "openwakeword"] = "whisper"
    stt_engine: Literal["faster-whisper", "openai"] = "faster-whisper"
    stt_model: Literal["tiny", "base", "small", "medium", "large-v3", "large-v3-turbo"] = "base"
    tts_engine: Literal["piper", "system", "off"] = "system"
    tts_voice: str = Field(default="pt_BR-faber-medium", max_length=80)
    system_voice_name: str = Field(default="", max_length=120)
    tts_rate: float = Field(default=1.0, ge=0.5, le=2.0)
    follow_up_seconds: int = Field(default=8, ge=0, le=60)
    vad_threshold: float = Field(default=0.015, ge=0.001, le=0.5)
    noise_floor: float = Field(default=0.0, ge=0.0, le=0.5)
    barge_in: bool = True
    speak_responses: bool = True


class AISettings(_Section):
    provider: Literal["ollama", "openai", "anthropic", "gemini", "none"] = "ollama"
    model: str = Field(default="", max_length=120)
    vision_model: str = Field(default="", max_length=120)
    temperature: float = Field(default=0.4, ge=0.0, le=2.0)
    context_window: int = Field(default=8192, ge=1024, le=1_000_000)
    ollama_host: str = Field(default="http://localhost:11434", max_length=200)
    max_agent_steps: int = Field(default=6, ge=1, le=20)

    @field_validator("ollama_host")
    @classmethod
    def _loopback_or_lan(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("ollama_host must start with http:// or https://")
        return v.rstrip("/")


class PrivacySettings(_Section):
    screen_capture_enabled: bool = True
    memory_enabled: bool = True
    history_enabled: bool = True
    history_retention_days: int = Field(default=30, ge=1, le=3650)
    external_provider_consent: bool = False


class AlertThresholds(_Section):
    ram_percent: int = Field(default=90, ge=50, le=100)
    cpu_percent: int = Field(default=95, ge=50, le=100)
    disk_free_gb: int = Field(default=5, ge=1, le=500)
    battery_percent: int = Field(default=15, ge=5, le=50)


class SystemSettings(_Section):
    file_index_enabled: bool = True
    file_index_roots: list[str] = Field(default_factory=list, max_length=30)
    index_content: bool = True
    proactive_enabled: bool = True
    alerts: AlertThresholds = Field(default_factory=AlertThresholds)
    focus_close_apps: list[str] = Field(default_factory=list, max_length=30)
    computer_control_enabled: bool = False


class AppearanceSettings(_Section):
    motion: Literal["system", "full", "reduced"] = "system"
    hud_intensity: float = Field(default=0.8, ge=0.2, le=1.0)
    compact_mode: bool = False
    sounds_enabled: bool = True


SECTIONS: dict[str, type[_Section]] = {
    "general": GeneralSettings,
    "voice": VoiceSettings,
    "ai": AISettings,
    "privacy": PrivacySettings,
    "system": SystemSettings,
    "appearance": AppearanceSettings,
}


class SettingsError(ValueError):
    pass


class SettingsManager:
    def __init__(self, db: Database, bus: EventBus) -> None:
        self.db = db
        self.bus = bus
        self._cache: dict[str, _Section] = {}
        self._load()

    def _load(self) -> None:
        for name, model in SECTIONS.items():
            row = self.db.one("SELECT value FROM settings WHERE key = ?", (name,))
            stored = loads(row["value"], {}) if row else {}
            try:
                self._cache[name] = model.model_validate(stored)
            except ValidationError:
                # Recover field by field so one corrupt value never resets everything.
                base = model().model_dump()
                for key, value in (stored or {}).items():
                    if key in base:
                        try:
                            model.model_validate({**base, key: value})
                            base[key] = value
                        except ValidationError:
                            pass
                self._cache[name] = model.model_validate(base)

    @property
    def general(self) -> GeneralSettings:
        return self._cache["general"]  # type: ignore[return-value]

    @property
    def voice(self) -> VoiceSettings:
        return self._cache["voice"]  # type: ignore[return-value]

    @property
    def ai(self) -> AISettings:
        return self._cache["ai"]  # type: ignore[return-value]

    @property
    def privacy(self) -> PrivacySettings:
        return self._cache["privacy"]  # type: ignore[return-value]

    @property
    def system(self) -> SystemSettings:
        return self._cache["system"]  # type: ignore[return-value]

    @property
    def appearance(self) -> AppearanceSettings:
        return self._cache["appearance"]  # type: ignore[return-value]

    def all(self) -> dict[str, Any]:
        return {name: section.model_dump() for name, section in self._cache.items()}

    async def update(self, patch: dict[str, Any]) -> dict[str, Any]:
        """Deep-merge a partial document, validate, persist and broadcast."""
        if not isinstance(patch, dict):
            raise SettingsError("settings patch must be an object")
        staged: dict[str, _Section] = {}
        for name, values in patch.items():
            model = SECTIONS.get(name)
            if model is None:
                raise SettingsError(f"unknown settings section: {name}")
            if not isinstance(values, dict):
                raise SettingsError(f"section {name} must be an object")
            merged = _deep_merge(self._cache[name].model_dump(), values)
            try:
                staged[name] = model.model_validate(merged)
            except ValidationError as exc:
                first = exc.errors()[0]
                loc = ".".join(str(p) for p in first.get("loc", ()))
                raise SettingsError(f"{name}.{loc}: {first.get('msg')}") from exc
        for name, section in staged.items():
            self._cache[name] = section
            self.db.execute(
                "INSERT INTO settings(key, value, updated_at) VALUES (?,?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                (name, dumps(section.model_dump()), now()),
            )
        if staged:
            await self.bus.publish("settings.updated", {"sections": list(staged), "settings": self.all()})
        return self.all()

    async def reset(self, section: str) -> dict[str, Any]:
        model = SECTIONS.get(section)
        if model is None:
            raise SettingsError(f"unknown settings section: {section}")
        self._cache[section] = model()
        self.db.execute("DELETE FROM settings WHERE key = ?", (section,))
        await self.bus.publish("settings.updated", {"sections": [section], "settings": self.all()})
        return self.all()


def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out

"""Text-to-speech.

- PiperTTS: local neural voices (default recommendation: pt_BR-faber-medium).
  Voices are original open models from the Piper project, not film audio.
- "system": the desktop client speaks with the OS voices (Windows SAPI via
  speechSynthesis), which works with zero downloads.
"""

from __future__ import annotations

import asyncio
import io
import re
import threading
import wave
from pathlib import Path
from typing import Any

RECOMMENDED_VOICES = [
    {"id": "pt_BR-faber-medium", "label": "Faber (pt-BR, masculina)", "sizeMb": 63},
    {"id": "pt_BR-cadu-medium", "label": "Cadu (pt-BR, masculina)", "sizeMb": 63},
    {"id": "en_GB-alan-medium", "label": "Alan (en-GB, masculina)", "sizeMb": 63},
    {"id": "en_US-ryan-high", "label": "Ryan (en-US, masculina)", "sizeMb": 120},
]
_VOICE_ID = re.compile(r"^[a-z]{2}_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$")


class PiperTTS:
    name = "piper"

    def __init__(self, models_dir: Path) -> None:
        self.voices_dir = models_dir / "piper"
        self._voices: dict[str, Any] = {}
        self._lock = threading.Lock()
        self.downloading: str | None = None

    @staticmethod
    def installed() -> bool:
        try:
            import piper  # noqa: F401

            return True
        except ImportError:
            return False

    def local_voices(self) -> list[str]:
        if not self.voices_dir.is_dir():
            return []
        return sorted(p.name[:-5] for p in self.voices_dir.glob("*.onnx") if (p.with_suffix(".onnx.json")).is_file())

    def has_voice(self, voice: str) -> bool:
        return (self.voices_dir / f"{voice}.onnx").is_file() and (self.voices_dir / f"{voice}.onnx.json").is_file()

    def status(self, voice: str) -> dict[str, Any]:
        if not self.installed():
            return {"available": False, "detail": "Pacote piper-tts não instalado (rode setup.cmd).", "voice": voice}
        if self.downloading:
            return {"available": False, "detail": f"Baixando voz {self.downloading}…", "voice": voice,
                    "downloading": True}
        ok = self.has_voice(voice)
        return {"available": ok, "voice": voice, "local": self.local_voices(),
                "detail": "Pronto" if ok else f"Voz '{voice}' não baixada."}

    def download(self, voice: str) -> None:
        if not _VOICE_ID.match(voice):
            raise ValueError("Identificador de voz inválido.")
        from piper.download_voices import download_voice

        self.voices_dir.mkdir(parents=True, exist_ok=True)
        self.downloading = voice
        try:
            download_voice(voice, self.voices_dir)
        finally:
            self.downloading = None

    def _voice(self, voice: str) -> Any:
        with self._lock:
            if voice in self._voices:
                return self._voices[voice]
            if not self.has_voice(voice):
                raise RuntimeError(f"Voz '{voice}' não está baixada.")
            from piper import PiperVoice

            v = PiperVoice.load(str(self.voices_dir / f"{voice}.onnx"))
            self._voices = {voice: v}  # keep only one voice in memory
            return v

    def synthesize_sync(self, text: str, voice: str, rate: float = 1.0) -> bytes:
        from piper import SynthesisConfig

        v = self._voice(voice)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            v.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, rate))))
        return buf.getvalue()

    async def synthesize(self, text: str, voice: str, rate: float = 1.0) -> bytes:
        return await asyncio.to_thread(self.synthesize_sync, text, voice, rate)


_SENTENCE_END = re.compile(r"(?<=[.!?…:;])\s+|\n+")


def split_sentences(buffer: str, final: bool = False) -> tuple[list[str], str]:
    """Split a streaming buffer into complete sentences + remainder."""
    parts = _SENTENCE_END.split(buffer)
    if final:
        return [p.strip() for p in parts if p.strip()], ""
    if len(parts) <= 1:
        return [], buffer
    complete = [p.strip() for p in parts[:-1] if p.strip()]
    return complete, parts[-1]


def speakable(text: str) -> str:
    """Strip markdown/code artefacts so TTS reads naturally."""
    t = re.sub(r"```.*?```", " ", text, flags=re.S)
    t = re.sub(r"`([^`]*)`", r"\1", t)
    t = re.sub(r"[*_#>]+", "", t)
    t = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", t)
    t = re.sub(r"https?://\S+", "o link", t)
    return re.sub(r"\s+", " ", t).strip()

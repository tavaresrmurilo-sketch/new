"""Speech-to-text engines.

- FasterWhisperSTT: local, private (default). The model is downloaded only
  when the user asks for it (onboarding or Settings › Voz), never implicitly.
  Silero VAD (bundled with faster-whisper) filters non-speech before decoding.
- OpenAISTT: optional cloud fallback (requires API key + external consent).
"""

from __future__ import annotations

import asyncio
import io
import threading
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

MODEL_SIZES_MB = {"tiny": 75, "base": 145, "small": 485, "medium": 1530, "large-v3": 3100, "large-v3-turbo": 1620}


@dataclass
class Transcript:
    text: str
    language: str | None
    duration_s: float
    elapsed_s: float
    no_speech: bool = False


def pcm16_to_float(pcm: bytes) -> np.ndarray:
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def pcm16_to_wav(pcm: bytes, sample_rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


class FasterWhisperSTT:
    name = "faster-whisper"

    def __init__(self, models_dir: Path) -> None:
        self.models_dir = models_dir / "whisper"
        self._model: Any = None
        self._model_size: str | None = None
        self._lock = threading.Lock()
        self.downloading: str | None = None
        self.last_error = ""

    @staticmethod
    def installed() -> bool:
        try:
            import faster_whisper  # noqa: F401

            return True
        except ImportError:
            return False

    def model_dir(self, size: str) -> Path:
        return self.models_dir / size

    def has_model(self, size: str) -> bool:
        return (self.model_dir(size) / "model.bin").is_file()

    def status(self, size: str) -> dict[str, Any]:
        if not self.installed():
            return {"available": False, "detail": "Pacote faster-whisper não instalado (rode setup.cmd).",
                    "model": size, "downloaded": False}
        if self.downloading:
            return {"available": False, "detail": f"Baixando modelo {self.downloading}…", "model": size,
                    "downloaded": False, "downloading": True}
        downloaded = self.has_model(size)
        return {"available": downloaded, "model": size, "downloaded": downloaded, "sizeMb": MODEL_SIZES_MB.get(size),
                "detail": "Pronto" if downloaded else f"Modelo '{size}' não baixado ({MODEL_SIZES_MB.get(size, '?')} MB)."}

    def download(self, size: str) -> Path:
        from faster_whisper.utils import download_model

        self.downloading = size
        try:
            out = self.model_dir(size)
            out.mkdir(parents=True, exist_ok=True)
            download_model(size, output_dir=str(out))
            return out
        finally:
            self.downloading = None

    def _load(self, size: str) -> Any:
        with self._lock:
            if self._model is not None and self._model_size == size:
                return self._model
            if not self.has_model(size):
                raise RuntimeError(f"Modelo de voz '{size}' não está baixado. Baixe em Configurações › Voz.")
            from faster_whisper import WhisperModel

            self._model = WhisperModel(str(self.model_dir(size)), device="auto", compute_type="int8")
            self._model_size = size
            return self._model

    def preload(self, size: str) -> bool:
        try:
            self._load(size)
            return True
        except Exception as exc:
            self.last_error = str(exc)
            return False

    def transcribe_sync(self, pcm: bytes, size: str, language: str | None, hotword: str) -> Transcript:
        model = self._load(size)
        audio = pcm16_to_float(pcm)
        started = time.time()
        segments, info = model.transcribe(
            audio,
            language=language,
            beam_size=1,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400, "speech_pad_ms": 200},
            condition_on_previous_text=False,
            initial_prompt=f"{hotword.capitalize()}.",
            hotwords=hotword.capitalize(),
            no_speech_threshold=0.6,
            temperature=0.0,
        )
        parts = [seg.text for seg in segments if getattr(seg, "no_speech_prob", 0) < 0.8]
        text = " ".join(p.strip() for p in parts).strip()
        return Transcript(text=text, language=getattr(info, "language", language), duration_s=len(audio) / 16000,
                          elapsed_s=round(time.time() - started, 3), no_speech=not text)

    async def transcribe(self, pcm: bytes, size: str, language: str | None, hotword: str = "jarvis") -> Transcript:
        return await asyncio.to_thread(self.transcribe_sync, pcm, size, language, hotword)


def speech_present(pcm: bytes) -> bool:
    """Silero VAD check (bundled with faster-whisper). Falls back to True if unavailable."""
    try:
        from faster_whisper.vad import VadOptions, get_speech_timestamps
    except ImportError:
        return True
    audio = pcm16_to_float(pcm)
    try:
        stamps = get_speech_timestamps(audio, VadOptions(min_speech_duration_ms=200, min_silence_duration_ms=300))
    except Exception:
        return True
    return bool(stamps)

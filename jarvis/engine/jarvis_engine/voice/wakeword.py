"""Wake word detection.

Two engines:
- "whisper" (default): speech segments gated by VAD are transcribed locally and
  the transcript must start with (or contain) the wake word, e.g. "Jarvis". This
  matches the exact word the user speaks and allows one-shot commands such as
  "Jarvis, abra o Spotify".
- "openwakeword": continuous low-power detector using the open pre-trained
  "hey_jarvis" model (the phrase is "Hey Jarvis"). Models (~5 MB) are fetched
  from the openWakeWord GitHub releases when this engine is enabled.
"""

from __future__ import annotations

import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from ..core.text import strip_accents

_VARIANTS = {
    "jarvis": ["jarvis", "jarvi", "jarves", "jarvas", "djarvis", "jervis", "javis", "jarbas", "jar vis", "charvis",
               "garvis", "yarvis", "jarviz", "jarvice", "service"],
}


@dataclass
class WakeMatch:
    matched: bool
    command: str  # text after the wake word (may be empty)
    position: str  # start | inside | none


def detect_wake(text: str, wake_word: str = "jarvis") -> WakeMatch:
    folded = strip_accents(text.lower())
    variants = _VARIANTS.get(wake_word.lower(), [wake_word.lower()])
    for v in variants:
        m = re.search(rf"(?:^|\b)(?:(?:ei|hey|ok|oi|ola|e ai)[\s,]+)?{re.escape(v)}\b[\s,.!?:;-]*", folded)
        if not m:
            continue
        position = "start" if m.start() <= 4 else "inside"
        if v == "service" and position != "start":
            continue
        command = text[m.end():].strip() if position == "start" else text[:m.start()].strip() + " " + text[m.end():].strip()
        return WakeMatch(True, command.strip(" ,.!?"), position)
    return WakeMatch(False, text, "none")


class OpenWakeWordEngine:
    MODEL = "hey_jarvis"
    THRESHOLD = 0.5

    def __init__(self, models_dir: Path) -> None:
        self.models_dir = models_dir / "openwakeword"
        self._model: Any = None
        self._lock = threading.Lock()
        self.last_error = ""

    @staticmethod
    def installed() -> bool:
        try:
            import openwakeword  # noqa: F401

            return True
        except ImportError:
            return False

    def _paths(self) -> dict[str, Path]:
        d = self.models_dir
        return {"model": d / f"{self.MODEL}_v0.1.onnx", "mel": d / "melspectrogram.onnx",
                "emb": d / "embedding_model.onnx"}

    def has_models(self) -> bool:
        return all(p.is_file() for p in self._paths().values())

    def download(self) -> None:
        import openwakeword.utils as oww_utils

        self.models_dir.mkdir(parents=True, exist_ok=True)
        oww_utils.download_models([self.MODEL], target_directory=str(self.models_dir))

    def status(self) -> dict[str, Any]:
        if not self.installed():
            return {"available": False, "detail": "Pacote openwakeword não instalado."}
        ok = self.has_models()
        return {"available": ok, "detail": "Pronto ('Hey Jarvis')" if ok else "Modelos não baixados (~5 MB)."}

    def _load(self) -> Any:
        with self._lock:
            if self._model is None:
                from openwakeword.model import Model

                p = self._paths()
                self._model = Model(wakeword_models=[str(p["model"])], inference_framework="onnx",
                                    melspec_model_path=str(p["mel"]), embedding_model_path=str(p["emb"]))
            return self._model

    def process(self, pcm16: bytes) -> float:
        """Feed 16 kHz mono int16 audio (multiples of 80 ms recommended). Returns the max score."""
        model = self._load()
        audio = np.frombuffer(pcm16, dtype=np.int16)
        scores = model.predict(audio)
        return float(max(scores.values())) if scores else 0.0

    def reset(self) -> None:
        with self._lock:
            if self._model is not None:
                try:
                    self._model.reset()
                except Exception:
                    self._model = None

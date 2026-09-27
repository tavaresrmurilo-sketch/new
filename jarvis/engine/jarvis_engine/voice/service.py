"""VoiceService: microphone utterances -> wake word -> STT -> JarvisCore, and TTS back out.

Capture and VAD happen in the desktop client (Web Audio), which sends only the
speech segments (16 kHz mono PCM16). In `openwakeword` mode the client streams
80 ms frames continuously and the detector runs here.

Privacy: speech that does not contain the wake word (outside a follow-up
window) is discarded: it is neither shown nor stored.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import time
from typing import TYPE_CHECKING, Any

from ..activity import Category
from .stt import MODEL_SIZES_MB, FasterWhisperSTT, pcm16_to_wav
from .tts import RECOMMENDED_VOICES, PiperTTS, speakable, split_sentences
from .wakeword import OpenWakeWordEngine, detect_wake

if TYPE_CHECKING:  # pragma: no cover
    from ..services.container import Services
    from ..services.hub import Client

MIN_UTTERANCE_S = 0.3
MAX_UTTERANCE_S = 30.0


class SpeechStream:
    """Incremental speech: feed LLM deltas, sentences are synthesised and played in order."""

    def __init__(self, voice: "VoiceService") -> None:
        self.voice = voice
        self.id = secrets.token_hex(4)
        self.buffer = ""
        self.queue: asyncio.Queue[str | None] = asyncio.Queue()
        self.seq = 0
        self.spoke = False
        self.worker = asyncio.create_task(self._run(), name=f"speech-{self.id}")

    def feed(self, delta: str) -> None:
        self.buffer += delta
        sentences, self.buffer = split_sentences(self.buffer)
        for s in sentences:
            self.queue.put_nowait(s)

    async def close(self) -> None:
        sentences, self.buffer = split_sentences(self.buffer, final=True)
        for s in sentences:
            self.queue.put_nowait(s)
        self.queue.put_nowait(None)
        try:
            await self.worker
        except asyncio.CancelledError:
            pass

    def cancel(self) -> None:
        self.worker.cancel()

    async def _run(self) -> None:
        v = self.voice
        try:
            while True:
                sentence = await self.queue.get()
                if sentence is None:
                    break
                text = speakable(sentence)
                if not text:
                    continue
                await v.emit_sentence(self, text)
                self.spoke = True
        finally:
            await v.end_stream(self)


class VoiceService:
    def __init__(self, services: "Services") -> None:
        self.s = services
        models = services.config.models_dir
        self.stt = FasterWhisperSTT(models)
        self.tts = PiperTTS(models)
        self.oww = OpenWakeWordEngine(models)
        self.follow_up_until = 0.0
        self.streams: dict[str, SpeechStream] = {}
        self._stt_lock = asyncio.Lock()
        self._oww_cooldown = 0.0
        self.last_latency: dict[str, float] = {}

    # ------------------------------------------------------------- status
    def status(self) -> dict[str, Any]:
        v = self.s.settings.voice
        stt = self.stt.status(v.stt_model) if v.stt_engine == "faster-whisper" else {
            "available": bool(os.environ.get("OPENAI_API_KEY")),
            "detail": "OpenAI Whisper (nuvem)", "model": "whisper-1"}
        if v.tts_engine == "piper":
            tts = self.tts.status(v.tts_voice)
        elif v.tts_engine == "system":
            tts = {"available": True, "detail": "Voz do sistema (Windows)"}
        else:
            tts = {"available": False, "detail": "Fala desativada"}
        wake = {"engine": v.wake_engine, "enabled": v.wake_word_enabled, "word": v.wake_word}
        wake |= self.oww.status() if v.wake_engine == "openwakeword" else {
            "available": stt.get("available", False), "detail": "Palavra 'Jarvis' via reconhecimento local"}
        return {
            "enabled": v.enabled, "stt": stt, "tts": tts, "wake": wake,
            "followUpUntil": self.follow_up_until, "sttModels": MODEL_SIZES_MB, "voices": RECOMMENDED_VOICES,
            "localVoices": self.tts.local_voices(), "latency": self.last_latency,
        }

    # ---------------------------------------------------------- downloads
    async def download(self, kind: str, name: str | None = None) -> dict[str, Any]:
        v = self.s.settings.voice
        act = self.s.activity
        await self.s.bus.publish("voice.download", {"kind": kind, "state": "started", "name": name})
        try:
            if kind == "stt":
                size = name or v.stt_model
                await asyncio.to_thread(self.stt.download, size)
            elif kind == "tts":
                voice = name or v.tts_voice
                await asyncio.to_thread(self.tts.download, voice)
            elif kind == "wake":
                await asyncio.to_thread(self.oww.download)
            else:
                raise ValueError("tipo de download desconhecido")
        except Exception as exc:
            act.log(Category.VOICE, f"Falha ao baixar modelo de voz ({kind})", level="error", error=str(exc))
            await self.s.bus.publish("voice.download", {"kind": kind, "state": "failed", "error": str(exc)})
            raise
        act.log(Category.VOICE, f"Modelo de voz baixado ({kind}: {name or ''})")
        await self.s.bus.publish("voice.download", {"kind": kind, "state": "done", "name": name})
        return self.status()

    async def preload(self) -> None:
        v = self.s.settings.voice
        if v.enabled and v.stt_engine == "faster-whisper" and self.stt.has_model(v.stt_model):
            ok = await asyncio.to_thread(self.stt.preload, v.stt_model)
            self.s.activity.log(Category.VOICE, "Reconhecimento de voz carregado" if ok else
                                f"Falha ao carregar reconhecimento de voz: {self.stt.last_error}",
                                level="info" if ok else "error")

    # ------------------------------------------------------------ capture
    def open_follow_up(self, seconds: float | None = None) -> None:
        secs = self.s.settings.voice.follow_up_seconds if seconds is None else seconds
        self.follow_up_until = time.time() + secs if secs > 0 else 0.0
        self.s.bus.emit("voice.listening", {"active": secs > 0, "until": self.follow_up_until})

    def in_follow_up(self) -> bool:
        return time.time() < self.follow_up_until

    async def transcribe(self, pcm: bytes) -> str:
        v = self.s.settings.voice
        lang = "pt" if self.s.settings.general.language.startswith("pt") else "en"
        if v.stt_engine == "openai":
            from ..providers.cloud import OpenAIProvider

            if not self.s.settings.privacy.external_provider_consent:
                raise RuntimeError("Autorize provedores externos em Privacidade para usar a transcrição na nuvem.")
            await self.s.bus.publish("privacy.external", {"provider": "OpenAI", "purpose": "transcrição de voz"})
            return (await OpenAIProvider().transcribe(pcm16_to_wav(pcm), lang)).strip()
        if not self.stt.installed():
            raise RuntimeError("Reconhecimento de voz indisponível: instale as dependências de voz (setup.cmd).")
        async with self._stt_lock:
            t = await self.stt.transcribe(pcm, v.stt_model, lang, v.wake_word)
        self.last_latency["sttMs"] = round(t.elapsed_s * 1000)
        return t.text

    async def handle_utterance(self, client: "Client", pcm: bytes, meta: dict[str, Any]) -> None:
        v = self.s.settings.voice
        if not v.enabled:
            return
        duration = len(pcm) / 2 / 16000
        if duration < MIN_UTTERANCE_S:
            return
        if duration > MAX_UTTERANCE_S:
            pcm = pcm[: int(MAX_UTTERANCE_S * 16000) * 2]
        mode = meta.get("mode", "auto")
        barge_in = bool(meta.get("bargeIn"))
        await self.s.bus.publish("voice.processing", {"durationMs": int(duration * 1000)})
        started = time.time()
        try:
            text = await self.transcribe(pcm)
        except Exception as exc:
            msg = str(exc) or "Falha no reconhecimento de voz."
            self.s.activity.log(Category.VOICE, "Falha na transcrição", level="error", error=msg)
            await self.s.bus.publish("voice.error", {"message": msg})
            return
        if not text or len(text) < 2:
            await self.s.bus.publish("voice.ignored", {"reason": "no_speech"})
            return
        needs_wake = v.wake_word_enabled and mode != "command" and not barge_in and not self.in_follow_up() \
            and not self.s.permissions.has_pending()
        wake = detect_wake(text, v.wake_word)
        if needs_wake:
            if not wake.matched:
                await self.s.bus.publish("voice.ignored", {"reason": "no_wake_word"})
                return
            command = wake.command
        else:
            command = wake.command if wake.matched and wake.position == "start" else text
        self.last_latency["transcribeTotalMs"] = round((time.time() - started) * 1000)
        if wake.matched and not command:
            await self.s.bus.publish("voice.wake", {"engine": "whisper"})
            await self.s.bus.publish("voice.transcript", {"text": text, "final": True})
            await self.s.core.respond_wake(source="voice")
            return
        await self.s.bus.publish("voice.transcript", {"text": command, "final": True})
        self.follow_up_until = 0.0
        await self.s.core.submit(command, source="voice")

    async def handle_frame(self, client: "Client", pcm: bytes) -> None:
        v = self.s.settings.voice
        if not (v.enabled and v.wake_word_enabled and v.wake_engine == "openwakeword"):
            return
        if not self.oww.has_models():
            return
        try:
            score = await asyncio.to_thread(self.oww.process, pcm)
        except Exception as exc:
            self.oww.last_error = str(exc)
            return
        now = time.time()
        if score >= self.oww.THRESHOLD and now > self._oww_cooldown:
            self._oww_cooldown = now + 2.0
            self.oww.reset()
            await self.s.bus.publish("voice.wake", {"engine": "openwakeword", "score": round(score, 3)})
            await self.s.hub.send(client, {"type": "voice.capture", "mode": "command"})

    # ------------------------------------------------------------ speaking
    def speech_enabled(self) -> bool:
        v = self.s.settings.voice
        return v.enabled and v.speak_responses and v.tts_engine != "off" and self.s.hub.has_capability("speech")

    def begin_speech(self) -> SpeechStream | None:
        if not self.speech_enabled():
            return None
        stream = SpeechStream(self)
        self.streams[stream.id] = stream
        return stream

    async def speak(self, text: str) -> None:
        stream = self.begin_speech()
        if stream is None:
            return
        stream.feed(text)
        await stream.close()

    async def emit_sentence(self, stream: SpeechStream, text: str) -> None:
        v = self.s.settings.voice
        client = self.s.hub.pick("speech")
        if client is None:
            return
        seq = stream.seq
        stream.seq += 1
        if v.tts_engine == "piper" and self.tts.installed() and self.tts.has_voice(v.tts_voice):
            started = time.time()
            try:
                wav = await self.tts.synthesize(text, v.tts_voice, v.tts_rate)
            except Exception as exc:
                self.s.activity.log(Category.VOICE, "Falha na síntese Piper; usando voz do sistema", level="warning",
                                    error=str(exc))
                wav = b""
            if wav:
                if seq == 0:
                    self.last_latency["ttsFirstMs"] = round((time.time() - started) * 1000)
                await self.s.hub.send_binary(client, {"kind": "tts", "utteranceId": stream.id, "seq": seq,
                                                      "text": text}, wav)
                return
        await self.s.hub.send(client, {"type": "voice.say", "utteranceId": stream.id, "seq": seq, "text": text,
                                       "rate": v.tts_rate, "voiceName": v.system_voice_name,
                                       "lang": self.s.settings.general.language})

    async def end_stream(self, stream: SpeechStream) -> None:
        self.streams.pop(stream.id, None)
        client = self.s.hub.pick("speech")
        if client is not None and stream.seq > 0:
            await self.s.hub.send(client, {"type": "voice.say_end", "utteranceId": stream.id, "count": stream.seq})

    async def interrupt(self) -> None:
        for stream in list(self.streams.values()):
            stream.cancel()
        self.streams.clear()
        await self.s.bus.publish("voice.interrupt", {})

    def speech_finished(self) -> None:
        """Client reports that playback ended; open the follow-up window."""
        self.open_follow_up()

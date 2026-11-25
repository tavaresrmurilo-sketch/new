"""Voice pipeline logic (wake word, follow-up window, privacy of ignored speech, TTS routing)."""

import asyncio
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np
import pytest

from jarvis_engine.voice.tts import speakable, split_sentences
from jarvis_engine.voice.wakeword import OpenWakeWordEngine, detect_wake


@pytest.mark.parametrize("text,matched,command", [
    ("Jarvis", True, ""),
    ("Jarvis, abra o Spotify", True, "abra o Spotify"),
    ("Ei Jarvis qual o uso da CPU", True, "qual o uso da CPU"),
    ("Djarvis.", True, ""),
    ("Jarbas, que horas são?", True, "que horas são"),
    ("vamos almoçar mais tarde", False, "vamos almoçar mais tarde"),
])
def test_detect_wake(text, matched, command):
    m = detect_wake(text)
    assert m.matched is matched
    if matched:
        assert m.command == command


def test_split_sentences_streaming():
    done, rest = split_sentences("Olá. Tudo bem? Estou verif")
    assert done == ["Olá.", "Tudo bem?"] and rest == "Estou verif"
    done, rest = split_sentences("fim sem ponto", final=True)
    assert done == ["fim sem ponto"] and rest == ""


def test_speakable_strips_markdown():
    assert speakable("**Pronto**: veja `x` em https://a.b/c") == "Pronto: veja x em o link"


class FakeClient:
    id = "c1"
    kind = "main"
    capabilities = {"speech"}


def pcm(seconds: float) -> bytes:
    return (np.zeros(int(16000 * seconds), dtype=np.int16)).tobytes()


async def feed(services, text: str, **meta):
    async def fake_transcribe(_pcm):
        return text

    services.voice.transcribe = fake_transcribe
    await services.voice.handle_utterance(FakeClient(), pcm(1.0), meta)
    for t in list(services.core._running):
        await t


async def test_wake_only_answers_and_opens_follow_up(services, recorder):
    await feed(services, "Jarvis.")
    assert recorder.responses()[-1] == "À disposição."
    assert services.voice.in_follow_up()


async def test_follow_up_without_wake_word(services, recorder):
    await feed(services, "Jarvis.")
    await feed(services, "que horas são")
    assert recorder.responses()[-1].startswith("São ")


async def test_ignored_speech_is_not_published(services, recorder):
    services.voice.follow_up_until = 0
    await feed(services, "conversa aleatória na sala")
    assert recorder.named("voice.transcript") == []
    assert recorder.named("voice.ignored")[-1]["reason"] == "no_wake_word"
    assert services.history.count() == 0


async def test_one_shot_command(services, recorder):
    await feed(services, "Jarvis, que horas são?")
    assert recorder.named("voice.transcript")[-1]["text"] == "que horas são"
    assert recorder.responses()[-1].startswith("São ")


async def test_short_utterance_dropped(services, recorder):
    await services.voice.handle_utterance(FakeClient(), pcm(0.1), {})
    assert not recorder.named("voice.processing")


async def test_system_tts_routed_to_speech_client(services):
    sent = []

    class Sock:
        async def send_text(self, data):
            sent.append(data)

        async def send_bytes(self, data):
            sent.append(data)

    services.hub.add(Sock(), "main", ["speech"])
    await services.settings.update({"voice": {"tts_engine": "system"}})
    await services.voice.speak("Olá. Sistemas prontos.")
    kinds = [__import__("json").loads(s)["type"] for s in sent if isinstance(s, str)]
    assert kinds.count("voice.say") == 2 and kinds[-1] == "voice.say_end"


def _espeak_wav(text: str, path: Path) -> np.ndarray | None:
    if not shutil.which("espeak-ng"):
        return None
    subprocess.run(["espeak-ng", "-v", "en-us", "-s", "150", "-w", str(path), text], check=True)
    with wave.open(str(path)) as w:
        rate = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    # resample to 16 kHz (linear interpolation is enough for a detector smoke test)
    n = int(len(data) * 16000 / rate)
    resampled = np.interp(np.linspace(0, len(data) - 1, n), np.arange(len(data)), data)
    return resampled.astype(np.int16)


@pytest.mark.skipif(not OpenWakeWordEngine.installed(), reason="openwakeword not installed")
def test_openwakeword_detects_hey_jarvis(tmp_path):
    """Real model inference on synthesized speech (needs network once to fetch the ~5 MB models)."""
    engine = OpenWakeWordEngine(tmp_path)
    try:
        engine.download()
    except Exception as exc:  # offline CI
        pytest.skip(f"models unavailable: {exc}")
    audio = _espeak_wav("hey jarvis", tmp_path / "hey.wav")
    if audio is None:
        pytest.skip("espeak-ng/ffmpeg unavailable")
    silence = np.zeros(16000, dtype=np.int16)
    stream = np.concatenate([silence, audio, silence])
    best = 0.0
    for i in range(0, len(stream) - 1280, 1280):
        best = max(best, engine.process(stream[i:i + 1280].tobytes()))
    engine.reset()
    neutral = _espeak_wav("the weather is nice today", tmp_path / "neg.wav")
    worst = 0.0
    for i in range(0, len(neutral) - 1280, 1280):
        worst = max(worst, engine.process(neutral[i:i + 1280].tobytes()))
    assert worst < best
    asyncio.get_event_loop_policy()

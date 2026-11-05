"""Transcreve o áudio com faster-whisper (Whisper small int8) e salva palavras com timestamps.

Uso: python transcribe.py <modelo_dir> <audio_16k.wav> <saida.json> [beam] [condition_prev]
"""
import json
import sys
import time

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

model_dir, audio, out = sys.argv[1], sys.argv[2], sys.argv[3]
beam = int(sys.argv[4]) if len(sys.argv) > 4 else 5
cond = (sys.argv[5] == "1") if len(sys.argv) > 5 else True

t0 = time.time()
data, sr = sf.read(audio, dtype="float32")
assert sr == 16000, sr
audio_np = data if data.ndim == 1 else data.mean(axis=1)
model = WhisperModel(model_dir, device="cpu", compute_type="int8", cpu_threads=4)
segments, info = model.transcribe(
    audio_np,
    language="pt",
    task="transcribe",
    beam_size=beam,
    best_of=5,
    temperature=[0.0, 0.2, 0.4, 0.6],
    condition_on_previous_text=cond,
    word_timestamps=True,
    vad_filter=False,
    initial_prompt=(
        "Entrevista do projeto Empreendendo Sem Fronteiras (ESF), em português do Brasil. "
        "Conversa sobre bordado, voluntárias, refugiados e imigrantes."
    ),
)
result = []
for s in segments:
    result.append(
        {
            "start": s.start,
            "end": s.end,
            "text": s.text,
            "avg_logprob": s.avg_logprob,
            "no_speech_prob": s.no_speech_prob,
            "words": [
                {"start": w.start, "end": w.end, "word": w.word, "prob": w.probability}
                for w in (s.words or [])
            ],
        }
    )
    print(f"[{s.start:7.2f} -> {s.end:7.2f}] ({s.avg_logprob:.2f}) {s.text}", flush=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump({"language": info.language, "duration": info.duration, "segments": result}, f, ensure_ascii=False, indent=1)
print(f"done in {time.time() - t0:.1f}s", file=sys.stderr)

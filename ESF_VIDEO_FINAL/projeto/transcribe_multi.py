"""Várias decodificações do mesmo áudio para comparar (consenso de transcrição).

Uso: python transcribe_multi.py <modelo_dir> <audio_16k.wav> <saida.json>
Cada passada: (nome, idioma, prompt, beam, condition_on_previous_text, trechos)
"""
import json
import sys

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

model_dir, audio_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
data, sr = sf.read(audio_path, dtype="float32")
assert sr == 16000
audio = data if data.ndim == 1 else data.mean(axis=1)
model = WhisperModel(model_dir, device="cpu", compute_type="int8", cpu_threads=4)

# Trechos das respostas da entrevistada (intervalos aproximados da 1ª passada, com folga)
ANSWERS = [(3.2, 5.3), (7.6, 9.0), (13.0, 20.4), (23.6, 25.6), (38.4, 58.9), (70.9, 81.9), (85.2, 90.5)]

passes = [
    ("pt_noprompt_b5", "pt", None, 5, True, None),
    ("pt_noprompt_b10_nocond", "pt", None, 10, False, None),
    ("pt_clips_b8", "pt", None, 8, False, ANSWERS),
    ("es_clips_b8", "es", None, 8, False, ANSWERS),
]

results = {}
for name, lang, prompt, beam, cond, clips in passes:
    spans = clips or [(0.0, len(audio) / sr)]
    segs_out = []
    for a, b in spans:
        chunk = audio[int(a * sr): int(b * sr)]
        segments, _ = model.transcribe(
            chunk, language=lang, beam_size=beam, best_of=5,
            temperature=[0.0, 0.2, 0.4], condition_on_previous_text=cond,
            word_timestamps=True, vad_filter=False, initial_prompt=prompt,
        )
        for s in segments:
            segs_out.append({
                "start": s.start + a, "end": s.end + a, "text": s.text.strip(),
                "words": [{"start": w.start + a, "end": w.end + a, "word": w.word, "prob": w.probability} for w in (s.words or [])],
            })
    results[name] = segs_out
    print(f"===== {name}", flush=True)
    for s in segs_out:
        print(f"[{s['start']:7.2f} -> {s['end']:7.2f}] {s['text']}", flush=True)

with open(out, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)

"""Amostragem com temperatura em trechos duvidosos: conta as variantes mais frequentes.

Uso: python sample_variants.py <modelo_dir> <audio_16k.wav>
"""
import collections
import sys

import soundfile as sf
from faster_whisper import WhisperModel

model_dir, audio_path = sys.argv[1], sys.argv[2]
data, sr = sf.read(audio_path, dtype="float32")
audio = data if data.ndim == 1 else data.mean(axis=1)
model = WhisperModel(model_dir, device="cpu", compute_type="int8", cpu_threads=4)

CLIPS = [
    ("nome", 3.3, 5.3, ["pt", "es"]),
    ("idade", 7.5, 9.1, ["pt", "es"]),
    ("tempo", 23.5, 25.7, ["pt", "es"]),
    ("expectativa", 38.4, 58.6, ["pt", "es"]),
    ("brasilia", 70.9, 82.0, ["pt", "es"]),
    ("espera", 84.9, 90.6, ["pt", "es"]),
    ("agradece", 92.5, 96.5, ["pt"]),
    ("fechamento", 96.4, 106.6, ["pt"]),
    ("final", 106.4, 115.35, ["pt"]),
]
N = 12
for name, a, b, langs in CLIPS:
    chunk = audio[int(a * sr): int(b * sr)]
    for lang in langs:
        counter = collections.Counter()
        # greedy + beam deterministic first
        for beam in (1, 5):
            segs, _ = model.transcribe(chunk, language=lang, beam_size=beam, temperature=0.0,
                                       condition_on_previous_text=False, vad_filter=False)
            counter[" ".join(s.text.strip() for s in segs)] += 1
        for i in range(N):
            segs, _ = model.transcribe(chunk, language=lang, beam_size=1, best_of=1, temperature=0.5,
                                       condition_on_previous_text=False, vad_filter=False)
            counter[" ".join(s.text.strip() for s in segs)] += 1
        print(f"===== {name} [{a}-{b}] {lang}", flush=True)
        for text, c in counter.most_common(6):
            print(f"  {c:2d}x {text}", flush=True)

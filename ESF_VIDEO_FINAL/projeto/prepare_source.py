"""Etapa 1 — prepara o material de origem.

  * decodifica TODOS os quadros reais do vídeo (VFR, sem duplicar/descartar) e guarda os timestamps;
  * substitui os quadros com falha de 1 quadro (glitches do arquivo original) pelo quadro anterior;
  * aplica a correção de imagem (grade.py) em paralelo e salva um memmap uint8 (N, 816, 464, 3);
  * estima o movimento lento da câmera (deriva) a 10 fps, usado pela câmera virtual;
  * extrai o áudio em 48 kHz (soxr).

Uso: python prepare_source.py <video_original.mp4> <pasta_de_trabalho>
"""
from __future__ import annotations

import json
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from grade import GLITCH_FRAMES_T, Grade  # noqa: E402

W, H = 464, 816


def probe_pts(src: str) -> np.ndarray:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "frame=pts_time", "-of", "csv=p=0", src],
        capture_output=True, text=True, check=True).stdout
    return np.array([float(x.strip(",")) for x in out.split() if x.strip(",")])


def decode_all(src: str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-fps_mode", "passthrough", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)


_G = Grade()


def _grade(f):
    return _G(f)


def scene_motion(frames: np.ndarray, pts: np.ndarray, ref_t: float = 12.0, step: float = 0.1):
    """Transformação afim (cena de referência → quadro) a cada 0.1 s, pela região da janela (estática)."""
    gray = lambda f: cv2.cvtColor(f, cv2.COLOR_RGB2GRAY).astype(np.float32)
    ref = gray(frames[int(np.argmin(np.abs(pts - ref_t)))])
    roi = (slice(110, 470), slice(0, W))
    ts = np.arange(0, pts[-1], step)
    warp = np.eye(2, 3, dtype=np.float32)
    out = []
    for t in ts:
        i = int(np.argmin(np.abs(pts - t)))
        w0 = warp.copy()
        try:
            _, w0 = cv2.findTransformECC(ref[roi], gray(frames[i])[roi], w0, cv2.MOTION_AFFINE,
                                         (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-6), None, 5)
            warp = w0
        except cv2.error:
            pass
        # o ECC trabalha em coordenadas da ROI (origem em y=110); converte para coordenadas do quadro:
        # (x, y) -> roi (x, y-110) -> warp -> (x', y'_roi) -> quadro (x', y'_roi + 110)
        A = warp.astype(np.float64)
        M = np.array([[A[0, 0], A[0, 1], A[0, 2] - A[0, 1] * 110],
                      [A[1, 0], A[1, 1], A[1, 2] - A[1, 1] * 110 + 110]])
        out.append(np.concatenate([[t], M.ravel()]))
    return np.array(out)


def main():
    src, work = sys.argv[1], Path(sys.argv[2])
    work.mkdir(parents=True, exist_ok=True)
    pts = probe_pts(src)
    frames = decode_all(src)
    n = min(len(pts), len(frames))
    pts, frames = pts[:n], frames[:n]
    print("quadros:", n)

    # quadros com falha → quadro anterior
    fixed = []
    for t in GLITCH_FRAMES_T:
        i = int(np.argmin(np.abs(pts - t)))
        if abs(pts[i] - t) < 0.006:
            fixed.append(i)
    frames = frames.copy()
    for i in sorted(fixed):
        frames[i] = frames[i - 1]
    print("quadros substituídos:", [(i, round(float(pts[i]), 3)) for i in fixed])

    motion = scene_motion(frames, pts)
    np.save(work / "scene_motion.npy", motion)

    mm = np.lib.format.open_memmap(work / "graded.npy", mode="w+", dtype=np.uint8, shape=(n, H, W, 3))
    with Pool(4) as pool:
        for i, g in enumerate(pool.imap(_grade, frames, chunksize=16)):
            mm[i] = g
    mm.flush()
    np.save(work / "pts.npy", pts)
    json.dump({"n": int(n), "fixed_frames": fixed}, open(work / "source_info.json", "w"))

    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vn", "-af", "aresample=48000:resampler=soxr",
                    "-ac", "1", "-c:a", "pcm_f32le", str(work / "voice48k.wav")], check=True)
    print("ok")


if __name__ == "__main__":
    main()

"""Posição de referência dos rostos (coordenadas da cena), usada pela câmera virtual.

Detecção Haar (OpenCV, frontal + perfil) a 2 quadros/s no vídeo ORIGINAL; cada detecção é levada para a
cena de referência pelo movimento estimado (scene_motion.npy) e o resultado é a mediana robusta.
Uso: python faces.py <video_original.mp4> <build_dir>
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

W, H = 464, 816


def main():
    src, build = sys.argv[1], Path(sys.argv[2])
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-t", "106.7", "-vf", "fps=2", "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
    front = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    prof = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
    mot = np.load(build / "scene_motion.npy")

    def M_at(t):
        i = int(np.clip(np.searchsorted(mot[:, 0], t), 0, len(mot) - 1))
        return mot[i, 1:].reshape(2, 3)

    pts = {"Manuela": [], "Thais": []}
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    for i, f in enumerate(frames):
        t = i / 2
        g = cv2.resize(clahe.apply(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY)), (W * 2, H * 2))
        for cas, flip in ((front, False), (prof, False), (prof, True)):
            im = cv2.flip(g, 1) if flip else g
            for (x, y, w, h) in cas.detectMultiScale(im, scaleFactor=1.07, minNeighbors=4, minSize=(60, 60)):
                if flip:
                    x = W * 2 - x - w
                cx, cy, s = x / 2 + w / 4, y / 2 + h / 4, w / 2
                if not (380 <= cy <= 700) or s < 50:
                    continue
                M = M_at(t)
                ref = np.linalg.solve(M[:, :2], np.array([cx, cy]) - M[:, 2])
                pts["Manuela" if cx < W / 2 else "Thais"].append(ref)
    out = {}
    for k, P in pts.items():
        P = np.array(P)
        med = np.median(P, axis=0)
        P = P[np.linalg.norm(P - med, axis=1) < 40]
        out[k] = np.median(P, axis=0).round(1).tolist()
    json.dump(out, open(build / "faces_ref.json", "w"))
    print(out)


if __name__ == "__main__":
    main()

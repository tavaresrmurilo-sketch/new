"""Generates Jarvis' original icon set (no external assets): concentric light rings on near-black.

Run with any Python that has numpy:  python scripts/make-icons.py
Outputs assets/icon.png (512), assets/icon.ico (16..256), assets/tray.png (32), assets/tray.ico (16/32).
"""

from __future__ import annotations

import io
import math
import struct
import zlib
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent / "assets"


def png_bytes(rgba: np.ndarray) -> bytes:
    h, w, _ = rgba.shape
    raw = b"".join(b"\x00" + rgba[y].astype(np.uint8).tobytes() for y in range(h))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def render(size: int, tray: bool = False) -> np.ndarray:
    ss = 4  # supersampling for smooth edges
    n = size * ss
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    c = (n - 1) / 2
    dx, dy = (x - c) / (n / 2), (y - c) / (n / 2)
    r = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    cyan = np.array([98, 230, 255], dtype=np.float32)
    ice = np.array([232, 248, 255], dtype=np.float32)
    rgb = np.zeros((n, n, 3), dtype=np.float32)
    alpha = np.zeros((n, n), dtype=np.float32)

    # plate
    plate = (r <= 0.98).astype(np.float32)
    if not tray:
        rgb += plate[..., None] * np.array([3, 9, 14], dtype=np.float32)
        alpha = np.maximum(alpha, plate)

    def ring(radius: float, width: float, color: np.ndarray, gap: float = 0.0, phase: float = 0.0, k: float = 1.0):
        nonlocal rgb, alpha
        band = np.clip(1 - np.abs(r - radius) / width, 0, 1)
        if gap:
            seg = (np.sin((ang + phase) * 3) > gap).astype(np.float32)
            band = band * seg
        band = band * k
        rgb = rgb * (1 - band[..., None]) + color * band[..., None]
        alpha = np.maximum(alpha, band)

    ring(0.86, 0.035 if not tray else 0.07, cyan, gap=-0.55, phase=0.4)
    ring(0.66, 0.03 if not tray else 0.06, cyan * 0.85, gap=-0.2, phase=1.3, k=0.9)
    # core glow
    glow = np.clip(1 - r / 0.42, 0, 1) ** 1.6
    rgb = rgb * (1 - glow[..., None]) + (ice * 0.6 + cyan * 0.4) * glow[..., None]
    alpha = np.maximum(alpha, glow)
    core = np.clip(1 - np.abs(r - 0.34) / 0.03, 0, 1)
    rgb = rgb * (1 - core[..., None]) + ice * core[..., None]
    alpha = np.maximum(alpha, core)

    rgba = np.dstack([rgb, alpha * 255])
    rgba = rgba.reshape(size, ss, size, ss, 4).mean(axis=(1, 3))
    return np.clip(rgba, 0, 255)


def ico_bytes(images: list[np.ndarray]) -> bytes:
    entries = []
    payloads = []
    offset = 6 + 16 * len(images)
    for img in images:
        data = png_bytes(img)
        h, w, _ = img.shape
        entries.append(struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(data), offset))
        payloads.append(data)
        offset += len(data)
    return struct.pack("<HHH", 0, 1, len(images)) + b"".join(entries) + b"".join(payloads)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "icon.png").write_bytes(png_bytes(render(512)))
    (OUT / "icon.ico").write_bytes(ico_bytes([render(s) for s in (16, 24, 32, 48, 64, 128, 256)]))
    (OUT / "tray.png").write_bytes(png_bytes(render(32, tray=True)))
    (OUT / "tray.ico").write_bytes(ico_bytes([render(16, tray=True), render(32, tray=True)]))
    print("icons written to", OUT)


if __name__ == "__main__":
    main()

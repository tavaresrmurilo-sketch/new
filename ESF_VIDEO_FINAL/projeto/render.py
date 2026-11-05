"""Renderização final de uma versão (A = entrevista, B = reels).

Uso:
  python render.py A <build_dir> <saida.mp4>            # vídeo completo
  python render.py A <build_dir> <pasta> --stills 1.0 5.5 …   # quadros de teste (PNG)

Por quadro de saída (30 fps): quadro original correspondente (tempo do EDL) → câmera virtual (recorte 9:16
em ponto flutuante) → Lanczos para 1080×1920 → nitidez leve (com limiar) → camadas gráficas.
A região da cabeça da criança (CHILD_PROTECT_REF) não recebe nitidez — só o redimensionamento.
Codificação: H.264 High 4.1, yuv420p BT.709, CRF 20 (teto 8 Mb/s), GOP 2 s, AAC 256 kb/s 48 kHz, faststart.
"""
from __future__ import annotations

import json
import subprocess
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
import graphics as G  # noqa: E402
from camera import Camera  # noqa: E402
from placement import assign_caption_bottoms  # noqa: E402
from plan import SPEAKERS, VERSIONS  # noqa: E402
from timeline import Timeline  # noqa: E402

FPS = 30
OW, OH = 1080, 1920
# Região ampla em volta da cabeça da criança (coordenadas da cena de referência). Ela NÃO recebe a nitidez
# de saída: ali o quadro é apenas redimensionado, e o desfoque original fica intacto (verify.py mede isso).
CHILD_PROTECT_REF = (235, 470, 435, 710)
FEATHER = 36.0


def ramp(n, a, b, f):
    x = np.arange(n, dtype=np.float32)
    return np.clip((x - (a - f)) / f, 0, 1) * np.clip(((b + f) - x) / f, 0, 1)


class Renderer:
    def __init__(self, key: str, build: Path):
        self.tl = Timeline(VERSIONS[key], FPS)
        self.cam = Camera(str(build / "scene_motion.npy"), str(build / "faces_ref.json"))
        self.frames = np.load(build / "graded.npy", mmap_mode="r")
        self.pts = np.load(build / "pts.npy")
        G.set_brand_dir(build / "brand")
        self.captions = G.CaptionLayer(self.tl.captions)
        assign_caption_bottoms(self.captions, self.tl, self.cam)
        self.lts = {k: G.LowerThird(*v) for k, v in SPEAKERS.items()}
        self.hook = G.HookText(self.tl.hook_lines) if self.tl.hook_lines else None
        self.sting = G.Sting(self.tl.sting_t) if self.tl.sting_t is not None else None
        self.endcard = G.EndCard(self.tl.end_start, self.tl.duration - self.tl.end_start)
        self.selo = G.soft_shadow(G.brand_sprite("esf_selo.png", 92), blur=8, alpha=0.45, pad=16)
        clips = [s for s in self.tl.segs if s.kind == "clip"]
        self.last_clip = clips[-1]

    def source_index(self, src_t: float) -> int:
        # quadro original exibido no instante src_t (o mais recente com pts ≤ src_t + meio quadro)
        i = int(np.searchsorted(self.pts, src_t + 0.5 / FPS, side="right") - 1)
        return int(np.clip(i, 0, len(self.pts) - 1))

    def video(self, t: float) -> Image.Image:
        seg = self.tl.at(t)
        if seg.kind == "clip":
            src_t = seg.src0 + (t - seg.out0)
            k = (t - seg.out0) / max(seg.dur, 1e-6)
        else:  # encerramento: último quadro congelado (sob a cortina)
            seg = self.last_clip
            src_t, k = seg.src1 - 1.0 / FPS, 1.0
        box = self.cam.box(src_t, seg.cam0, seg.cam1, k)
        im = Image.fromarray(np.asarray(self.frames[self.source_index(src_t)]))
        out = im.resize((OW, OH), Image.LANCZOS, box=box)
        sharp = out.filter(ImageFilter.UnsharpMask(radius=2.0, percent=45, threshold=2))
        mask = self.protect_mask(src_t, box)
        if mask is None:
            return sharp
        return Image.composite(out, sharp, mask)

    def protect_mask(self, src_t, box):
        x0, y0, x1, y1 = box
        M = self.cam.motion.M(src_t)
        a = M @ np.array([CHILD_PROTECT_REF[0], CHILD_PROTECT_REF[1], 1.0])
        b = M @ np.array([CHILD_PROTECT_REF[2], CHILD_PROTECT_REF[3], 1.0])
        sx, sy = OW / (x1 - x0), OH / (y1 - y0)
        ax, ay, bx, by = (a[0] - x0) * sx, (a[1] - y0) * sy, (b[0] - x0) * sx, (b[1] - y0) * sy
        if bx < -FEATHER or ax > OW + FEATHER or by < -FEATHER or ay > OH + FEATHER:
            return None
        m = np.outer(ramp(OH, ay, by, FEATHER), ramp(OW, ax, bx, FEATHER))
        return Image.fromarray((m * 255 + 0.5).astype(np.uint8), "L")

    def frame(self, n: int) -> Image.Image:
        t = n / FPS
        tl = self.tl
        if t >= tl.end_start + 0.62:
            base = Image.new("RGBA", (OW, OH))
        else:
            base = self.video(t).convert("RGBA")
        if t < tl.end_start + 0.62:
            if self.hook and t < tl.hook_end + 0.75:
                fade = 1 - G.clamp01((t - (tl.hook_end - 0.02)) / 0.30)
                if fade > 0:
                    G.blit(base, G.veil(), 0, 0, fade)
                    self.hook.draw(base, t, fade)
            self.captions.draw(base, t)
            for who, t0, t1 in tl.lower_thirds:
                if t0 - 0.1 <= t <= t1 + 0.1:
                    self.lts[who].draw(base, t, t0, t1)
            if self.sting is not None:
                a = min(G.clamp01((t - (tl.sting_t + 0.85)) / 0.4), 1 - G.clamp01((t - (tl.end_start - 0.45)) / 0.3))
                G.blit(base, self.selo, OW - 40, 206, a * 0.95, 1.0, "rt")
                self.sting.draw(base, t)
        base = self.endcard.draw(base, t)
        return base.convert("RGB")


_R: Renderer | None = None


def _init(key, build):
    global _R
    _R = Renderer(key, Path(build))


def _render(n):
    return _R.frame(n).tobytes()


def render_video(key: str, build: Path, out_mp4: Path, audio_wav: Path):
    tl = Timeline(VERSIONS[key], FPS)
    nframes = int(round(tl.duration * FPS))
    cmd = ["ffmpeg", "-v", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-",
           "-i", str(audio_wav),
           "-map", "0:v", "-map", "1:a",
           "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p",
           "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-profile:v", "high", "-level:v", "4.1",
           "-maxrate", "8M", "-bufsize", "16M", "-g", "60", "-keyint_min", "30",
           "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
           "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
           "-t", f"{nframes / FPS:.3f}", "-movflags", "+faststart",
           "-metadata", "title=ESF — Empreendendo Sem Fronteiras",
           str(out_mp4)]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(3, initializer=_init, initargs=(key, str(build))) as pool:
        for i, buf in enumerate(pool.imap(_render, range(nframes), chunksize=4)):
            enc.stdin.write(buf)
            if i % 300 == 0:
                print(f"  {key}: quadro {i}/{nframes}", flush=True)
    enc.stdin.close()
    if enc.wait() != 0:
        raise SystemExit("ffmpeg falhou")


if __name__ == "__main__":
    key, build, out = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    if "--stills" in sys.argv:
        times = [float(x) for x in sys.argv[sys.argv.index("--stills") + 1:]]
        r = Renderer(key, build)
        out.mkdir(parents=True, exist_ok=True)
        for tt in times:
            r.frame(int(round(tt * FPS))).save(out / f"{key}_{tt:07.2f}.png")
        print("ok")
    else:
        audio = build / f"{VERSIONS[key]['name']}_audio.wav"
        render_video(key, build, out, audio)
        print("ok", out)

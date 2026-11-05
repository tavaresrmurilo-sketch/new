"""Controle de qualidade de uma versão renderizada. Gera um relatório JSON + imagens de conferência.

Verifica:
  1. formato (H.264/AAC, 1080×1920, 30 fps CFR, yuv420p BT.709, faststart) e durações áudio = vídeo;
  2. quadros pretos inesperados (blackdetect) e quadros "piscando" (falhas de 1 quadro);
  3. loudness (−14 LUFS, pico real ≤ −1 dBTP);
  4. câmera virtual: o selo antigo e os títulos/tarjas antigos ficam SEMPRE fora do recorte;
  5. legendas/tarjas/gancho: dentro da zona segura e sem cobrir rostos (geometria por quadro);
  6. desfoque da criança: índice de nitidez (independente de contraste) da região da cabeça da criança no
     vídeo final vs. o original, quadro a quadro, + mosaico lado a lado para conferência visual.
Uso: python verify.py <A|B> <build_dir> <video.mp4> <pasta_relatorio> <video_original.mp4>
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import graphics as G  # noqa: E402
from camera import Camera  # noqa: E402
from placement import assign_caption_bottoms, head_boxes  # noqa: E402
from plan import SPEAKERS, VERSIONS  # noqa: E402
from timeline import Timeline  # noqa: E402


def alpha_bbox(spr, x, y):
    bb = spr.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    if not bb:
        return None
    return (x + bb[0], y + bb[1], x + bb[2], y + bb[3])


def text_boxes(tl, cam):
    """Retângulos REAIS ocupados por legenda/gancho/tarja: lista de (t0, t1, nome, x0, y0, x1, y1)."""
    out = []
    cl = G.CaptionLayer(tl.captions)
    assign_caption_bottoms(cl, tl, cam)
    for i, c in enumerate(tl.captions):
        x0, y0, bw, bh, *_ = cl.layout(i)
        out.append((c.t0 - 0.12, c.t1 + 0.12, "legenda", x0, y0, x0 + bw, y0 + bh + 14))
    if tl.hook_lines:
        hk = G.HookText(tl.hook_lines)
        xs0, ys0, xs1, ys1 = 1e9, 1e9, -1e9, -1e9
        for line_items, under in hk.items:
            for (_t, spr, x, y, _wl) in line_items:
                bb = alpha_bbox(spr, x, y)
                if bb:
                    xs0, ys0, xs1, ys1 = min(xs0, bb[0]), min(ys0, bb[1]), max(xs1, bb[2]), max(ys1, bb[3])
            if under:
                ys1 = max(ys1, under[3] + 6)
        out.append((0.0, tl.hook_end + 0.3, "gancho", xs0, ys0, xs1, ys1))
    for who, t0, t1 in tl.lower_thirds:
        lt = G.LowerThird(*SPEAKERS[who])
        out.append((t0, t1, "tarja", 56, 330, 56 + lt.sprite.width, 330 + lt.sprite.height))
    return out


def original_frame(orig_path, pts_t):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{pts_t:.6f}", "-i", str(orig_path), "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(SRC_H, SRC_W, 3)

FPS, OW, OH = 30, 1080, 1920
SRC_W, SRC_H = 464, 816
CHILD_REF = (282, 545, 392, 655)   # cabeça da criança (coords. da cena de referência)


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def moov_first(path):
    with open(path, "rb") as f:
        head = f.read(1 << 20)
    i, j = head.find(b"moov"), head.find(b"mdat")
    return i != -1 and (j == -1 or i < j)


def decode_frames(path, times):
    frames = {}
    for t in times:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.4f}", "-i", str(path), "-frames:v", "1",
                              "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
        frames[t] = np.frombuffer(raw, np.uint8).reshape(OH, OW, 3)
    return frames


def sharpness_index(gray):
    """Energia de alta frequência normalizada pela variância local (não muda com brilho/contraste)."""
    g = gray.astype(np.float64)
    lap = ndimage.laplace(ndimage.gaussian_filter(g, 0.6))
    return float(lap.var() / (g.var() + 1e-6))


def main():
    key, build, video, rep_dir = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
    orig_video = Path(sys.argv[5])
    rep_dir.mkdir(parents=True, exist_ok=True)
    tl = Timeline(VERSIONS[key], FPS)
    cam = Camera(str(build / "scene_motion.npy"), str(build / "faces_ref.json"))
    pts = np.load(build / "pts.npy")
    src = np.load(build / "graded.npy", mmap_mode="r")
    fixed = set(json.load(open(build / "source_info.json"))["fixed_frames"])  # quadros com falha substituídos
    report = {"versao": tl.name}

    # 1. formato ----------------------------------------------------------------------------
    info = probe(video)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next(s for s in info["streams"] if s["codec_type"] == "audio")
    report["formato"] = {
        "video": f'{v["codec_name"]} {v.get("profile")} L{v.get("level")} {v["width"]}x{v["height"]} {v["pix_fmt"]} '
                 f'{v["r_frame_rate"]} (média {v["avg_frame_rate"]}) cor={v.get("color_space")}/{v.get("color_transfer")}',
        "audio": f'{a["codec_name"]} {a["sample_rate"]} Hz {a["channels"]} canais {int(a.get("bit_rate", 0)) // 1000} kb/s',
        "duracao_video_s": float(v["duration"]), "duracao_audio_s": float(a["duration"]),
        "duracao_planejada_s": tl.duration, "faststart_moov_no_inicio": moov_first(video),
        "tamanho_MB": round(int(info["format"]["size"]) / 1e6, 2),
        "bitrate_kbps": int(info["format"]["bit_rate"]) // 1000,
    }
    ok_fmt = (v["codec_name"] == "h264" and v["width"] == OW and v["height"] == OH and v["pix_fmt"] == "yuv420p"
              and v["r_frame_rate"] == "30/1" and a["codec_name"] == "aac"
              and abs(float(v["duration"]) - float(a["duration"])) < 0.05)
    report["formato"]["ok"] = bool(ok_fmt)

    # 2. pretos e falhas de 1 quadro ---------------------------------------------------------------
    bd = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-vf", "blackdetect=d=0.04:pic_th=0.97:pix_th=0.08",
                         "-an", "-f", "null", "-"], capture_output=True, text=True).stderr
    blacks = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", bd)
    report["quadros_pretos"] = [(float(x), float(y)) for x, y in blacks]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", "scale=135:240,format=gray", "-f", "rawvideo",
                          "-pix_fmt", "gray", "-"], capture_output=True).stdout
    small = np.frombuffer(raw, np.uint8).reshape(-1, 240, 135).astype(np.float32)
    d = np.abs(np.diff(small, axis=0)).mean(axis=(1, 2))
    cuts = {int(round(s.out0 * FPS)) for s in tl.segs}
    flicker = []
    for i in range(1, len(small) - 1):
        if d[i - 1] > 6 and d[i] > 6 and np.abs(small[i + 1] - small[i - 1]).mean() < 0.4 * min(d[i - 1], d[i]):
            if not any(abs(i - c) <= 1 for c in cuts):
                flicker.append(round(i / FPS, 3))
    report["falhas_de_1_quadro"] = flicker

    # 3. loudness ----------------------------------------------------------------------------------
    lo = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(video), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"],
                        capture_output=True, text=True).stderr
    summ = lo[lo.rindex("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
    LRA = float(re.search(r"LRA:\s+([\d.]+) LU", summ).group(1))
    TP = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ).group(1))
    report["loudness"] = {"integrado_LUFS": I, "LRA_LU": LRA, "pico_real_dBTP": TP, "ok": abs(I + 14) <= 0.5 and TP <= -1.0}

    # 4/5. geometria por quadro ---------------------------------------------------------------------
    viol_overlay, caption_face_hits, min_gap = [], [], 1e9
    faces_ref = {k: cam.faces[k] for k in ("M", "T")}
    face_r_ref = 46.0  # raio aproximado da cabeça (inclui cabelo), coords. de referência
    tboxes = text_boxes(tl, cam)
    for n in range(int(round(tl.duration * FPS))):
        t = n / FPS
        s = tl.at(t)
        if s.kind != "clip":
            continue
        src_t = s.src0 + (t - s.out0)
        k = (t - s.out0) / max(s.dur, 1e-6)
        x0, y0, x1, y1 = cam.box(src_t, s.cam0, s.cam1, k)
        if y0 < 75.9 or x1 > SRC_W + 1e-6 or y1 > SRC_H + 1e-6 or x0 < -1e-6:
            viol_overlay.append((round(t, 2), "selo/limites"))
        if 0.28 <= src_t <= 6.75 and (y0 < 139.9 or y1 > 727.1):
            viol_overlay.append((round(t, 2), "titulo/tarjas antigas"))
        rects = head_boxes(tl, cam, t)
        # caixas de texto ativas neste instante (extensão real de cada elemento)
        boxes = [(nm, bx0, by0, bx1, by1) for (t0, t1, nm, bx0, by0, bx1, by1) in tboxes if t0 <= t <= t1]
        for (bname, bx0, by0, bx1, by1) in boxes:
            for (who, fx0, fy0, fx1, fy1) in rects:
                gap = fy0 - by1
                min_gap = min(min_gap, gap) if (bx0 < fx1 and fx0 < bx1) else min_gap
                if bx0 < fx1 and fx0 < bx1 and by0 < fy1 and fy0 < by1:
                    caption_face_hits.append((round(t, 2), bname, who))
    report["camera_overlays_antigos_visiveis"] = viol_overlay[:20]
    report["texto_sobre_rosto"] = caption_face_hits[:20]
    report["menor_distancia_texto_rosto_px"] = round(min_gap, 1)

    # 6. desfoque da criança --------------------------------------------------------------------------
    times = []
    for s in tl.segs:
        if s.kind == "clip":
            times += [x for x in np.arange(s.out0 + 0.2, s.out1 - 0.1, 1.0)
                      if not (tl.sting_t is not None and tl.sting_t - 0.35 <= x <= tl.sting_t + 1.05)
                      and x < tl.end_start - 0.15]
    frames = decode_frames(video, times)
    rows, tiles = [], []
    for t in times:
        s = tl.at(t)
        src_t = s.src0 + (t - s.out0)
        k = (t - s.out0) / max(s.dur, 1e-6)
        x0, y0, x1, y1 = cam.box(src_t, s.cam0, s.cam1, k)
        M = cam.motion.M(src_t)
        cx0, cy0 = M @ np.array([CHILD_REF[0], CHILD_REF[1], 1.0])
        cx1, cy1 = M @ np.array([CHILD_REF[2], CHILD_REF[3], 1.0])
        if cx0 < x0 or cy0 < y0 or cx1 > x1 or cy1 > y1:
            continue  # região fora do quadro neste plano
        i = int(np.clip(np.searchsorted(pts, src_t + 0.5 / FPS, side="right") - 1, 0, len(pts) - 1))
        j = i
        while j in fixed:  # o quadro com falha foi trocado pelo anterior: compara com o que de fato foi usado
            j -= 1
        srcf = original_frame(orig_video, float(pts[j]))      # ORIGINAL, antes de qualquer tratamento
        gradedf = np.asarray(src[i])                          # após a correção de cor
        crop = (int(cx0), int(cy0), int(cx1), int(cy1))
        orig = Image.fromarray(srcf).crop(crop).convert("L")
        grad = Image.fromarray(gradedf).crop(crop).convert("L")
        sx, sy = OW / (x1 - x0), OH / (y1 - y0)
        ob = (int((cx0 - x0) * sx), int((cy0 - y0) * sy), int((cx1 - x0) * sx), int((cy1 - y0) * sy))
        outr = Image.fromarray(frames[t]).crop(ob)
        out_small = outr.convert("L").resize(orig.size, Image.LANCZOS)
        si_o = sharpness_index(np.asarray(orig))
        si_g = sharpness_index(np.asarray(grad))
        si_v = sharpness_index(np.asarray(out_small))
        rows.append((round(t, 2), round(src_t, 2), round(si_o, 4), round(si_g, 4), round(si_v, 4)))
        if len(tiles) < 12:
            tiles.append((Image.fromarray(srcf).crop(crop).resize((240, 240)), outr.resize((240, 240)), t))
    r_final = [r[4] / r[2] for r in rows if r[2] > 0]
    r_grade = [r[3] / r[2] for r in rows if r[2] > 0]
    report["desfoque_crianca"] = {
        "amostras": len(rows),
        "nitidez_final_sobre_original_mediana": round(float(np.median(r_final)), 3) if rows else None,
        "nitidez_final_sobre_original_max": round(float(np.max(r_final)), 3) if rows else None,
        "nitidez_correcao_cor_sobre_original_mediana": round(float(np.median(r_grade)), 3) if rows else None,
        "nota": "índice = energia de alta frequência / variância (independe de brilho e contraste). "
                "≈1.0 = mesmo grau de desfoque do original; valores >1.3 indicariam realce de detalhe.",
        "amostras_detalhe": rows,
    }
    if tiles:
        sheet = Image.new("RGB", (len(tiles) * 250, 520), (20, 20, 20))
        dr = ImageDraw.Draw(sheet)
        for j, (o, f, t) in enumerate(tiles):
            sheet.paste(o, (j * 250, 20))
            sheet.paste(f, (j * 250, 275))
            dr.text((j * 250 + 4, 2), f"{t:.1f}s original", fill=(255, 255, 0))
            dr.text((j * 250 + 4, 262), "final", fill=(255, 255, 0))
        sheet.save(rep_dir / f"{tl.name}_conferencia_desfoque_crianca.png")
    (rep_dir / f"{tl.name}_QA.json").write_text(json.dumps(report, indent=1, ensure_ascii=False, default=str),
                                               encoding="utf-8")
    print(json.dumps(report, indent=1, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()

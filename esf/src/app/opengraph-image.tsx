import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "@/content/site";
import { buildDots } from "@/components/intro/globe/data";
import { mixRgb, palette, rgb, toHex } from "@/lib/palette";

export const alt = "ESF — Empreendendo Sem Fronteiras: conectando pessoas, criando oportunidades e transformando recomeços.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Cores da imagem (paleta oficial). */
const C = {
  bgTop: palette.night2,
  bg: palette.night,
  halo: palette.purple,
  globe: toHex(mixRgb("purpleDeep", "night", 0.45)),
  rim: palette.purple,
  dot: toHex(mixRgb("lavender", rgb("purple"), 0.15)),
  home: palette.rose,
  text: palette.lavender,
  muted: toHex(mixRgb("lavender", "purpleDeep", 0.3)),
  accent: palette.orange,
};

const fontsDir = join(process.cwd(), "src/app/fonts");
const serif = readFile(join(fontsDir, "instrument-serif-latin.woff"));
const serifItalic = readFile(join(fontsDir, "instrument-serif-latin-italic.woff"));
// logo oficial completa da ESF (fundo transparente, feita para fundos escuros)
const lockup = readFile(join(process.cwd(), "src/assets/brand/esf-logo.png"), "base64");

/** Mesmo globo pontilhado da abertura (dados reais de terra), centrado no Brasil. */
function globeDots() {
  const cx = 965;
  const cy = 330;
  const r = 300;
  const dots = buildDots(2.1);
  const lat0 = (-12 * Math.PI) / 180;
  const lon0 = (-48 * Math.PI) / 180;
  const out: { x: number; y: number; o: number; br: boolean }[] = [];
  for (let i = 0; i < dots.count; i++) {
    const lat = dots.ll[i * 2];
    const lon = dots.ll[i * 2 + 1];
    let x = Math.cos(lat) * Math.sin(lon);
    const y = Math.sin(lat);
    let z = Math.cos(lat) * Math.cos(lon);
    // Ry(-lon0)
    const cyR = Math.cos(-lon0);
    const syR = Math.sin(-lon0);
    [x, z] = [x * cyR + z * syR, -x * syR + z * cyR];
    // Rx(lat0)
    const y2 = y * Math.cos(lat0) - z * Math.sin(lat0);
    const z2 = y * Math.sin(lat0) + z * Math.cos(lat0);
    if (z2 <= 0.05) continue;
    out.push({ x: cx + x * r, y: cy - y2 * r, o: 0.25 + z2 * 0.6, br: dots.info[i * 2 + 1] === 1 });
  }
  return { cx, cy, r, dots: out };
}

export default async function OpengraphImage() {
  const [regular, italic, lockupData] = await Promise.all([serif, serifItalic, lockup]);
  const g = globeDots();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: `linear-gradient(160deg, ${C.bgTop} 0%, ${C.bg} 70%)`,
          color: C.text,
          fontFamily: "Instrument Serif",
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          <circle cx={g.cx} cy={g.cy} r={g.r + 28} fill={C.halo} opacity="0.12" />
          <circle cx={g.cx} cy={g.cy} r={g.r} fill={C.globe} />
          {g.dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.br ? 2.6 : 2.1} fill={d.br ? C.home : C.dot} opacity={d.o} />
          ))}
          <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke={C.rim} strokeOpacity="0.6" strokeWidth="2" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "48px 72px 64px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={`data:image/png;base64,${lockupData}`} width={192} height={171} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 600 }}>
            <div style={{ fontSize: 92, lineHeight: 1, letterSpacing: -2 }}>Empreendendo</div>
            <div style={{ display: "flex", fontSize: 92, lineHeight: 1.08, letterSpacing: -2, fontStyle: "italic" }}>
              sem fronteiras<span style={{ color: C.accent }}>.</span>
            </div>
            <div style={{ marginTop: 28, fontSize: 30, color: C.muted, lineHeight: 1.3, maxWidth: 520 }}>{site.tagline}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Instrument Serif", data: regular, style: "normal", weight: 400 },
        { name: "Instrument Serif", data: italic, style: "italic", weight: 400 },
      ],
    },
  );
}

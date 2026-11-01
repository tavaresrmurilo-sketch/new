import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { site } from "@/content/site";
import { buildDots } from "@/components/intro/globe/data";

export const alt = "ESF — Empreendendo Sem Fronteiras: conectando pessoas, criando oportunidades e transformando recomeços.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontsDir = join(process.cwd(), "src/app/fonts");
const serif = readFile(join(fontsDir, "instrument-serif-latin.woff"));
const serifItalic = readFile(join(fontsDir, "instrument-serif-latin-italic.woff"));

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
    let x = dots.positions[i * 3];
    const y = dots.positions[i * 3 + 1];
    let z = dots.positions[i * 3 + 2];
    // Ry(-lon0)
    const cyR = Math.cos(-lon0);
    const syR = Math.sin(-lon0);
    [x, z] = [x * cyR + z * syR, -x * syR + z * cyR];
    // Rx(lat0)
    const y2 = y * Math.cos(lat0) - z * Math.sin(lat0);
    const z2 = y * Math.sin(lat0) + z * Math.cos(lat0);
    if (z2 <= 0.05) continue;
    out.push({ x: cx + x * r, y: cy - y2 * r, o: 0.25 + z2 * 0.6, br: dots.info[i * 3 + 1] === 1 });
  }
  return { cx, cy, r, dots: out };
}

export default async function OpengraphImage() {
  const [regular, italic] = await Promise.all([serif, serifItalic]);
  const g = globeDots();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "linear-gradient(160deg, #0b1d2e 0%, #050e19 70%)",
          color: "#F7F5F0",
          fontFamily: "Instrument Serif",
        }}
      >
        <svg width="1200" height="630" viewBox="0 0 1200 630" style={{ position: "absolute", left: 0, top: 0 }}>
          <circle cx={g.cx} cy={g.cy} r={g.r + 28} fill="#4A9D99" opacity="0.06" />
          <circle cx={g.cx} cy={g.cy} r={g.r} fill="#0b2133" />
          {g.dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.br ? 2.6 : 2.1} fill={d.br ? "#F28C45" : "#DCE6EE"} opacity={d.o} />
          ))}
          <circle cx={g.cx} cy={g.cy} r={g.r} fill="none" stroke="#4A9D99" strokeOpacity="0.5" strokeWidth="2" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <svg width="56" height="56" viewBox="0 0 100 100">
              <path d="M89.13 41.68A40 40 0 1 1 58.32 10.87" fill="none" stroke="#F7F5F0" strokeWidth="8" strokeLinecap="round" />
              <path d="M50 90A16 40 0 0 1 50 10" fill="none" stroke="#F7F5F0" strokeWidth="5.5" strokeLinecap="round" opacity="0.55" />
              <circle cx="79" cy="21" r="9" fill="#F28C45" />
            </svg>
            <div style={{ display: "flex", fontSize: 30, letterSpacing: 8 }}>ESF</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 600 }}>
            <div style={{ fontSize: 92, lineHeight: 1, letterSpacing: -2 }}>Empreendendo</div>
            <div style={{ display: "flex", fontSize: 92, lineHeight: 1.08, letterSpacing: -2, fontStyle: "italic" }}>
              sem fronteiras<span style={{ color: "#F28C45" }}>.</span>
            </div>
            <div style={{ marginTop: 28, fontSize: 30, color: "#A9B4BF", lineHeight: 1.3, maxWidth: 520 }}>{site.tagline}</div>
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

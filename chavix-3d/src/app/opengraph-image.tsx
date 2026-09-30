import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "CHAVIX 3D — Sua ideia. Sua chave. Seu estilo.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const fontDir = join(process.cwd(), "node_modules/geist/dist/fonts");
  const [semibold, mono, mark] = await Promise.all([
    readFile(join(fontDir, "geist-sans/Geist-SemiBold.ttf")),
    readFile(join(fontDir, "geist-mono/GeistMono-Regular.ttf")),
    readFile(join(process.cwd(), "public/brand/chavix-mark.svg"), "utf8"),
  ]);
  const markUri = `data:image/svg+xml;base64,${Buffer.from(mark.replace(/#5b3df5/g, "#8f7dff")).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#121217",
          backgroundImage: "repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 9px)",
          color: "#fff",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <img src={markUri} width={72} height={72} alt="" />
          <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>CHAVIX</div>
          <div style={{ fontFamily: "GeistMono", fontSize: 20, border: "2px solid #fff", borderRadius: 6, padding: "2px 8px" }}>3D</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: -4, lineHeight: 1.02 }}>Sua ideia.</div>
          <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: -4, lineHeight: 1.02, color: "#8f7dff" }}>Sua chave.</div>
          <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: -4, lineHeight: 1.02 }}>Seu estilo.</div>
        </div>
        <div style={{ display: "flex", fontFamily: "GeistMono", fontSize: 22, color: "#9d9dab", letterSpacing: 2 }}>
          CHAVEIROS EM IMPRESSÃO 3D · PERSONALIZADOS · PIX
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "GeistMono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}

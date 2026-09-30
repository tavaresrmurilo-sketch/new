import { cn } from "@/lib/cn";

/** Prévia desenhada do chaveiro personalizado: formato, cor, texto e camadas laterais. */
export function CustomPreview({ shapeId, color, text, className }: { shapeId: string; color: string; text: string; className?: string }) {
  const n = Number.parseInt(color.slice(1), 16);
  const luminance = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const ink = luminance > 0.6 ? "#1a1a21" : "#ffffff";
  const label = text.trim() || "SEU TEXTO";

  const shape = (fill: string) => {
    switch (shapeId) {
      case "circulo":
        return <circle cx="160" cy="118" r="84" fill={fill} />;
      case "hexagono":
        return <polygon points="252,118 206,197.7 114,197.7 68,118 114,38.3 206,38.3" fill={fill} />;
      case "coracao":
        return <path d="M160 206 C60 150 62 60 116 52 C140 48 154 62 160 74 C166 62 180 48 204 52 C258 60 260 150 160 206Z" fill={fill} />;
      case "letra":
        return (
          <text x="160" y="196" textAnchor="middle" fontSize="210" fontWeight="900" fontFamily="var(--font-geist-sans), sans-serif" fill={fill}>
            {(text.trim()[0] ?? "A").toUpperCase()}
          </text>
        );
      case "livre":
        return <path d="M84 170 C44 128 76 52 134 66 C160 26 238 44 228 100 C276 128 244 206 186 190 C156 222 96 214 84 170Z" fill={fill} />;
      default:
        return <rect x="40" y="72" width="240" height="96" rx="30" fill={fill} />;
    }
  };

  const hole = shapeId === "tag" || !["circulo", "hexagono", "coracao", "letra", "livre"].includes(shapeId) ? [66, 120] : shapeId === "letra" ? null : [160, shapeId === "coracao" ? 84 : 52];
  const textY = shapeId === "circulo" ? 132 : shapeId === "hexagono" ? 128 : shapeId === "coracao" ? 132 : 130;
  const textX = shapeId === "tag" || !["circulo", "hexagono", "coracao", "letra", "livre"].includes(shapeId) ? 176 : 160;
  const maxWidth = shapeId === "tag" || !["circulo", "hexagono", "coracao", "letra", "livre"].includes(shapeId) ? 170 : 130;
  const fontSize = Math.min(38, Math.max(14, (maxWidth / Math.max(label.length, 1)) * 1.7));

  return (
    <svg viewBox="0 0 320 240" className={cn("h-auto w-full", className)} role="img" aria-label={`Prévia: ${label}`}>
      <defs>
        <linearGradient id="pv-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".12" />
        </linearGradient>
      </defs>
      <g opacity=".22" transform="translate(10 22)" style={{ filter: "blur(8px)" }}>
        {shape("#000")}
      </g>
      {[12, 10, 8, 6, 4, 2].map((dy, i) => (
        <g key={dy} transform={`translate(0 ${dy})`} style={{ filter: `brightness(${i % 2 ? 0.62 : 0.7})` }}>
          {shape(color)}
        </g>
      ))}
      {shape(color)}
      <g style={{ mixBlendMode: "soft-light" }}>{shape("url(#pv-sheen)")}</g>
      {shapeId !== "letra" && shapeId !== "livre" && (
        <text
          x={textX}
          y={textY}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="800"
          letterSpacing="-0.02em"
          fontFamily="var(--font-geist-sans), sans-serif"
          fill={ink}
          opacity={text.trim() ? 1 : 0.4}
        >
          {label.slice(0, 24)}
        </text>
      )}
      {hole && (
        <>
          <circle cx={hole[0]} cy={hole[1]} r="9" fill="var(--color-sunken)" />
          <circle cx={hole[0] - (shapeId === "tag" || !["circulo", "hexagono", "coracao"].includes(shapeId) ? 26 : 0)} cy={hole[1] - (shapeId === "tag" || !["circulo", "hexagono", "coracao"].includes(shapeId) ? 0 : 26)} r="30" fill="none" stroke="#b4b4bd" strokeWidth="5" />
        </>
      )}
    </svg>
  );
}

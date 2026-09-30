const SHAPES: Record<string, { body: (fill: string) => React.ReactNode; hole?: [number, number] }> = {
  tag: { body: (fill) => <rect x="8" y="23" width="48" height="22" rx="7" fill={fill} />, hole: [15, 34] },
  circulo: { body: (fill) => <circle cx="32" cy="34" r="20" fill={fill} />, hole: [32, 20] },
  hexagono: { body: (fill) => <polygon points="52,34 42,51.3 22,51.3 12,34 22,16.7 42,16.7" fill={fill} />, hole: [32, 22] },
  coracao: {
    body: (fill) => <path d="M32 52 C10 38 12 20 24 18 C29 17.3 31 20 32 22 C33 20 35 17.3 40 18 C52 20 54 38 32 52Z" fill={fill} />,
    hole: [32, 28],
  },
  letra: {
    body: (fill) => <path d="M16 50 L27 16 H37 L48 50 H40 L37.6 42 H26.4 L24 50 Z M28.4 35 H35.6 L32 23 Z" fill={fill} fillRule="evenodd" />,
  },
  livre: {
    body: (fill) => <path d="M18 44 C10 34 18 18 30 22 C36 12 52 18 48 30 C58 36 50 52 38 48 C32 56 20 54 18 44Z" fill={fill} />,
    hole: [26, 30],
  },
};

/** Silhuetas dos formatos do chaveiro personalizado. Ids desconhecidos usam a tag. */
export function ShapeIcon({ shapeId, color = "currentColor", className }: { shapeId: string; color?: string; className?: string }) {
  const shape = SHAPES[shapeId] ?? SHAPES.tag;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {shape.body(color)}
      {shape.hole && <circle cx={shape.hole[0]} cy={shape.hole[1]} r="2.6" fill="var(--color-canvas)" />}
    </svg>
  );
}

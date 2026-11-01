import type { InitiativeArt, PillarGlyph } from "@/content/site";
import { bookShape, cubeShape, inclusionShape, ringsShape, segmentPath, type Shape } from "@/lib/shapes";

/* ------------------------------------------------------------------ */
/* Pilares — mesma geometria dos símbolos da abertura                  */
/* ------------------------------------------------------------------ */

const PILLAR_SHAPES: Record<PillarGlyph, { shape: Shape; accent?: { cx: number; cy: number; r: number }; float?: boolean }> = {
  inclusao: { shape: inclusionShape, float: true },
  empreendedorismo: { shape: cubeShape, accent: { cx: 50, cy: 12, r: 4.2 } },
  educacao: { shape: bookShape, accent: { cx: 50, cy: 30, r: 4.2 } },
  colaboracao: { shape: ringsShape, accent: { cx: 50, cy: 28.6, r: 4.2 } },
};

export function PillarGlyphArt({ glyph, className }: { glyph: PillarGlyph; className?: string }) {
  const { shape, accent, float } = PILLAR_SHAPES[glyph];
  const strokes = shape.filter((s) => s.kind !== "disc");
  const discs = shape.flatMap((s) => (s.kind === "disc" ? [s] : []));
  return (
    <svg viewBox="-4 -4 108 108" className={className} aria-hidden="true" focusable="false">
      {strokes.map((s, i) => (
        <path
          key={i}
          className="stroke"
          d={segmentPath(s)}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {discs.map((d, i) => {
        const isFloat = float && i === discs.length - 1;
        return (
          <circle
            key={`d${i}`}
            cx={d.c[0]}
            cy={d.c[1]}
            r={d.r}
            className={isFloat ? "accent float" : undefined}
            fill={isFloat ? undefined : "currentColor"}
          />
        );
      })}
      {accent && <circle cx={accent.cx} cy={accent.cy} r={accent.r} className="accent" />}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Iniciativas — ilustrações de traço                                   */
/* ------------------------------------------------------------------ */

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Podcast() {
  return (
    <>
      <rect x="66" y="12" width="28" height="48" rx="14" {...common} />
      <path d="M74 26h12M74 34h12M74 42h12" {...common} opacity="0.5" />
      <path d="M56 44a24 24 0 0 0 48 0" {...common} />
      <path d="M80 68v14M66 84h28" {...common} />
      <g className="pulse">
        <path className="draw" pathLength={1} d="M46 26a26 26 0 0 0 0 32" {...common} />
        <path className="draw" pathLength={1} d="M114 26a26 26 0 0 1 0 32" {...common} />
        <path className="draw" pathLength={1} d="M34 18a40 40 0 0 0 0 48" {...common} opacity="0.55" />
        <path className="draw" pathLength={1} d="M126 18a40 40 0 0 1 0 48" {...common} opacity="0.55" />
      </g>
      <circle cx="104" cy="20" r="4" className="accent" />
    </>
  );
}

function Palestra() {
  return (
    <>
      <circle cx="80" cy="26" r="9" {...common} />
      <path d="M64 56c0-9 7-16 16-16s16 7 16 16" {...common} />
      <path d="M50 56h60" {...common} />
      <path d="M58 56l6 32h32l6-32" {...common} />
      <path d="M72 70h16" {...common} opacity="0.5" />
      <g>
        <path className="draw" pathLength={1} d="M104 20l16-8" {...common} />
        <path className="draw" pathLength={1} d="M108 32h20" {...common} />
        <path className="draw" pathLength={1} d="M104 44l16 8" {...common} />
        <path className="draw" pathLength={1} d="M56 20l-16-8" {...common} />
        <path className="draw" pathLength={1} d="M52 32H32" {...common} />
        <path className="draw" pathLength={1} d="M56 44l-16 8" {...common} />
      </g>
      <circle cx="80" cy="26" r="3.2" className="accent" />
    </>
  );
}

function Workshop() {
  return (
    <>
      <rect x="40" y="20" width="24" height="24" rx="5" {...common} />
      <rect x="68" y="20" width="24" height="24" rx="5" {...common} />
      <rect x="96" y="20" width="24" height="24" rx="5" {...common} strokeDasharray="3 4" opacity="0.6" />
      <rect x="40" y="48" width="24" height="24" rx="5" {...common} />
      <rect x="68" y="48" width="24" height="24" rx="5" {...common} />
      <g className="slide">
        <rect x="96" y="48" width="24" height="24" rx="5" className="accent" />
      </g>
      <path className="draw" pathLength={1} d="M30 84h100" {...common} opacity="0.5" />
    </>
  );
}

function Midia() {
  return (
    <>
      <rect x="58" y="14" width="44" height="70" rx="9" {...common} />
      <path d="M74 40v18l15-9z" {...common} />
      <path d="M72 76h16" {...common} opacity="0.5" />
      <g className="pulse">
        <path className="draw" pathLength={1} d="M112 34a18 18 0 0 1 0 30" {...common} />
        <path className="draw" pathLength={1} d="M122 26a30 30 0 0 1 0 46" {...common} opacity="0.55" />
        <path className="draw" pathLength={1} d="M48 34a18 18 0 0 0 0 30" {...common} />
        <path className="draw" pathLength={1} d="M38 26a30 30 0 0 0 0 46" {...common} opacity="0.55" />
      </g>
      <circle cx="100" cy="16" r="4.5" className="accent" />
    </>
  );
}

function Voluntariado() {
  return (
    <>
      <circle cx="54" cy="34" r="8" {...common} />
      <circle cx="80" cy="28" r="8" {...common} />
      <circle cx="106" cy="34" r="8" {...common} />
      <path d="M40 72c0-8 6-14 14-14s14 6 14 14" {...common} />
      <path d="M66 66c0-8 6-14 14-14s14 6 14 14" {...common} />
      <path d="M92 72c0-8 6-14 14-14s14 6 14 14" {...common} />
      <path className="draw" pathLength={1} d="M34 84c15 6 77 6 92 0" {...common} />
      <circle cx="80" cy="28" r="3.2" className="accent" />
    </>
  );
}

const ART: Record<InitiativeArt, () => React.JSX.Element> = {
  podcast: Podcast,
  palestra: Palestra,
  workshop: Workshop,
  midia: Midia,
  voluntariado: Voluntariado,
};

export function InitiativeArtwork({ art, className }: { art: InitiativeArt; className?: string }) {
  const Comp = ART[art];
  return (
    <svg viewBox="0 0 160 96" className={className} aria-hidden="true" focusable="false">
      <Comp />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Ícones utilitários                                                  */
/* ------------------------------------------------------------------ */

export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M7 17L17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ArrowDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

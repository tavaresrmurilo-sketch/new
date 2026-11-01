import { LOGO_MERIDIAN, LOGO_RING, LOGO_SUN, segmentPath } from "@/lib/shapes";

const ringPath = segmentPath(LOGO_RING);
const meridianPath = segmentPath(LOGO_MERIDIAN);
const sun = LOGO_SUN.kind === "disc" ? LOGO_SUN : { c: [79, 21] as const, r: 8.5 };

/**
 * Marca da ESF: um círculo aberto (a fronteira que se abre), um meridiano (o mundo)
 * e um ponto laranja atravessando a abertura (o novo começo).
 * A mesma geometria é usada pelas partículas da abertura (src/lib/shapes.ts).
 */
export function LogoMark({
  className,
  title,
  sunColor = "var(--color-ember)",
}: {
  className?: string;
  title?: string;
  sunColor?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d={ringPath} fill="none" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" />
      <path d={meridianPath} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.55" />
      <circle cx={sun.c[0]} cy={sun.c[1]} r={sun.r} fill={sunColor} />
    </svg>
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className ?? ""}`}>
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-sans text-[1.05rem] font-extrabold tracking-[0.14em]">ESF</span>{" "}
        {!compact && (
          <span className="mt-1 hidden text-[0.62rem] font-semibold uppercase tracking-[0.2em] opacity-70 sm:block">
            Empreendendo Sem Fronteiras
          </span>
        )}
      </span>
    </span>
  );
}

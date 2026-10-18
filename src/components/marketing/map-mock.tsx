import { Navigation, Sparkles } from "lucide-react";
import { CategoryIcon } from "@/components/events/category-icon";
import { CATEGORY_SEED } from "@/lib/categories";
import { cn } from "@/lib/utils";

/**
 * Ilustração do produto feita em HTML/CSS: um mapa estilizado com pinos por categoria
 * e um card de evento com barras no lugar do texto. Não representa eventos reais.
 */
const PINS = [
  { x: 14, y: 30, c: "shows" },
  { x: 42, y: 24, c: "gastronomia" },
  { x: 68, y: 33, c: "arte" },
  { x: 88, y: 52, c: "feiras" },
  { x: 22, y: 56, c: "teatro-danca" },
  { x: 64, y: 64, c: "passeios" },
  { x: 9, y: 70, c: "infantil" },
  { x: 44, y: 70, c: "esportes" },
] as const;

const FEATURED = { x: 53, y: 47, c: "festas" } as const;

function cat(slug: string) {
  return CATEGORY_SEED.find((c) => c.slug === slug) ?? CATEGORY_SEED[0];
}

function Pin({ x, y, slug, featured }: { x: number; y: number; slug: string; featured?: boolean }) {
  const c = cat(slug);
  return (
    <span className="absolute -translate-x-1/2 -translate-y-full" style={{ left: `${x}%`, top: `${y}%` }}>
      {featured && <span className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 animate-pulse-ring rounded-full" style={{ background: c.color }} />}
      <span
        className={cn(
          "relative grid -rotate-45 place-items-center rounded-[50%_50%_50%_6px] shadow-float",
          featured ? "size-12 border-[3px] border-white" : "size-8 border-2 border-white/90",
        )}
        style={{ background: featured ? "linear-gradient(135deg,#7c5cff,#ff4d8d 60%,#ff8a3d)" : c.color }}
      >
        <span className="rotate-45 text-white">
          <CategoryIcon icon={c.icon} className={featured ? "size-5" : "size-3.5"} />
        </span>
      </span>
    </span>
  );
}

export function MapMock({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <span className="sr-only">Ilustração: mapa da cidade com pinos coloridos por categoria e um evento em destaque.</span>
      <div aria-hidden className="relative aspect-[4/3.6] overflow-hidden rounded-[32px] border border-border bg-[var(--map-bg)] shadow-float">
        <svg viewBox="0 0 400 360" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
          <rect x="250" y="190" width="120" height="90" rx="18" className="fill-success/15" />
          <path d="M-20 300 C 80 260, 140 330, 230 300 S 360 240, 430 270" className="fill-none stroke-info/25" strokeWidth="22" strokeLinecap="round" />
          <g className="stroke-border-strong" strokeLinecap="round" fill="none">
            <path d="M-10 120 L 410 90" strokeWidth="9" />
            <path d="M120 -10 L 160 370" strokeWidth="9" />
            <path d="M300 -10 C 280 120, 330 220, 290 370" strokeWidth="7" />
            <path d="M-10 210 L 410 230" strokeWidth="5" />
            <path d="M40 -10 L 70 370" strokeWidth="4" />
            <path d="M210 -10 L 225 370" strokeWidth="4" />
            <path d="M-10 40 L 410 30" strokeWidth="3" />
            <path d="M-10 165 L 410 160" strokeWidth="3" />
            <path d="M360 -10 L 380 370" strokeWidth="3" />
          </g>
        </svg>

        {/* Chips de categoria */}
        <div className="absolute top-3 right-3 left-3 flex gap-1.5 overflow-hidden">
          {["shows", "festas", "gastronomia", "arte"].map((slug, i) => {
            const c = cat(slug);
            return (
              <span key={slug} className={cn("glass flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 shadow-card", i === 0 && "bg-primary-soft")}>
                <span className="grid size-5 place-items-center rounded-full text-white" style={{ background: c.color }}>
                  <CategoryIcon icon={c.icon} className="size-3" />
                </span>
                <span className="h-2 w-8 rounded-full bg-foreground/15" />
              </span>
            );
          })}
        </div>

        {PINS.map((p) => (
          <Pin key={p.c} x={p.x} y={p.y} slug={p.c} />
        ))}
        <Pin x={FEATURED.x} y={FEATURED.y} slug={FEATURED.c} featured />

        {/* Você está aqui */}
        <span className="absolute" style={{ left: "32%", top: "42%" }}>
          <span className="absolute -inset-3 rounded-full bg-info/20" />
          <span className="relative block size-4 rounded-full border-[3px] border-white bg-info shadow-card" />
        </span>

        {/* Card do evento */}
        <div className="glass absolute right-3 bottom-3 left-3 flex items-center gap-3 rounded-3xl border border-border p-3 shadow-float sm:right-auto sm:w-[78%]">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl" style={{ background: "linear-gradient(135deg,#ff4d8d,#b04dff 55%,#7c5cff)" }}>
            <span className="absolute -right-3 -bottom-3 size-10 rounded-full bg-white/25" />
            <span className="absolute top-2 left-2 size-4 rounded-full bg-white/35" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <span className="bg-brand-gradient inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
              <Sparkles className="size-3" /> Destaque
            </span>
            <span className="block h-3 w-[85%] rounded-full bg-foreground/80" />
            <span className="block h-2.5 w-[55%] rounded-full bg-foreground/25" />
          </div>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
            <Navigation className="size-4" />
          </span>
        </div>
      </div>

      {/* Mini painel de resultados (sem números) */}
      <div aria-hidden className="glass absolute -top-5 -right-2 hidden w-44 rounded-3xl border border-border p-4 shadow-float sm:block lg:-right-6">
        <span className="block h-2 w-16 rounded-full bg-foreground/25" />
        <div className="mt-3 flex h-14 items-end gap-1.5">
          {[38, 52, 44, 70, 62, 88, 100].map((h, i) => (
            <span key={i} className="flex-1 rounded-t-md bg-brand-gradient" style={{ height: `${h}%`, opacity: 0.45 + i * 0.08 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

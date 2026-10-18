"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Segmented } from "@/components/ui/chip";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DailyPoint {
  day: string;
  signups: number;
  events: number;
}

type Metric = "signups" | "events";
const LABEL: Record<Metric, string> = { signups: "Cadastros", events: "Eventos criados" };

function niceMax(max: number, ticks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 4, step: 1 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, Math.ceil([1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow));
  return { max: step * Math.ceil(max / step), step };
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function dayLabel(key: string) {
  const [, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

function bar(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Gráfico de colunas (SVG próprio) dos últimos 30 dias, com dica ao passar o dedo/mouse e navegação por teclado. */
export function DailyChart({ series }: { series: DailyPoint[] }) {
  const [metric, setMetric] = useState<Metric>("signups");
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = series.map((p) => p[metric]);
  const total = values.reduce((a, b) => a + b, 0);
  const { max, step } = niceMax(Math.max(0, ...values));
  const height = 220;
  const m = { top: 10, right: 4, bottom: 26, left: 34 };
  const innerW = Math.max(0, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;
  const band = series.length ? innerW / series.length : 0;
  const barW = Math.max(2, Math.min(18, band - 3));
  const y = (v: number) => m.top + innerH - (v / max) * innerH;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const every = width < 480 ? 10 : 7;
  const tip = active != null ? series[active] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[28px] leading-none font-extrabold tracking-tight tabular-nums">{formatNumber(total)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {LABEL[metric].toLowerCase()} nos últimos {series.length} dias
          </p>
        </div>
        <Segmented
          label="Métrica do gráfico"
          value={metric}
          onChange={(v) => {
            setMetric(v);
            setActive(null);
          }}
          options={[
            { value: "signups", label: "Cadastros" },
            { value: "events", label: "Eventos" },
          ]}
        />
      </div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-labelledby={titleId}
            tabIndex={0}
            className="block touch-pan-y rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerMove={(e) => {
              const x = e.clientX - e.currentTarget.getBoundingClientRect().left - m.left;
              setActive(x < 0 || x > innerW ? null : Math.min(series.length - 1, Math.max(0, Math.floor(x / band))));
            }}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive((a) => a ?? series.length - 1)}
            onBlur={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              setActive((a) => Math.min(series.length - 1, Math.max(0, (a ?? series.length - 1) + (e.key === "ArrowRight" ? 1 : -1))));
            }}
          >
            <title id={titleId}>
              {`${LABEL[metric]} por dia nos últimos ${series.length} dias: ${formatNumber(total)} no total. Use as setas para percorrer os dias.`}
            </title>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="var(--border)" shapeRendering="crispEdges" />
                <text x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-subtle-foreground text-[11px] tabular-nums">
                  {formatNumber(t)}
                </text>
              </g>
            ))}
            {active != null && <rect x={m.left + active * band} y={m.top} width={band} height={innerH} className="fill-foreground/[0.05]" />}
            {series.map((p, i) => {
              const v = p[metric];
              if (v <= 0) return null;
              const h = Math.max(2, (v / max) * innerH);
              return (
                <path
                  key={p.day}
                  d={bar(m.left + i * band + (band - barW) / 2, m.top + innerH - h, barW, h)}
                  className={cn("transition-colors", metric === "signups" ? (active === i ? "fill-primary-hover" : "fill-primary") : active === i ? "fill-accent/80" : "fill-accent")}
                />
              );
            })}
            {series.map((p, i) =>
              (i % every === 0 && i < series.length - every / 2) || i === series.length - 1 ? (
                <text key={p.day} x={m.left + i * band + band / 2} y={height - 6} textAnchor={i === series.length - 1 ? "end" : "middle"} className="fill-subtle-foreground text-[11px]">
                  {i === series.length - 1 ? "hoje" : dayLabel(p.day)}
                </text>
              ) : null,
            )}
          </svg>
        )}
        {tip && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 min-w-28 -translate-x-1/2 rounded-xl border border-border bg-elevated px-3 py-2 shadow-float"
            style={{ left: Math.min(Math.max(m.left + (active ?? 0) * band + band / 2, 64), width - 64) }}
          >
            <p className="text-[17px] leading-tight font-extrabold tabular-nums">{formatNumber(tip[metric])}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {LABEL[metric]} · {dayLabel(tip.day)}
            </p>
          </div>
        )}
        {!total && width > 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-muted-foreground">Nenhum registro neste período</p>
        )}
      </div>
    </div>
  );
}

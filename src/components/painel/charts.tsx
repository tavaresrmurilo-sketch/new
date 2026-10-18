"use client";

import { Table2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Gráficos do painel em SVG próprio (sem dependências), responsivos e acessíveis. */

export interface SeriesPoint {
  day: string; // YYYY-MM-DD
  views: number;
  uniqueViews: number;
  saves: number;
  going: number;
  ticketClicks: number;
  shares: number;
}

export type MetricKey = Exclude<keyof SeriesPoint, "day">;

export const METRICS: { key: MetricKey; label: string; short: string }[] = [
  { key: "views", label: "Visualizações", short: "Visualizações" },
  { key: "uniqueViews", label: "Visitantes únicos", short: "Únicos" },
  { key: "saves", label: "Salvamentos", short: "Salvamentos" },
  { key: "going", label: "“Vou”", short: "“Vou”" },
  { key: "ticketClicks", label: "Cliques em ingresso", short: "Ingresso" },
  { key: "shares", label: "Compartilhamentos", short: "Compart." },
];

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function dayLabel(day: string, withWeekday = false) {
  const [y, m, d] = day.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}`;
  if (!withWeekday) return base;
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${base}`;
}

/** Máximo "redondo" para o eixo (1, 2, 2,5, 5 × 10^n) e passos. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 4, step: 1 };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const nice = Math.max(1, step >= 1 ? Math.ceil(step) : step);
  return { max: nice * Math.ceil(max / nice), step: nice };
}

/** Coluna com a ponta arredondada (4 px) e base reta. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function DailyColumns({ series, metric, height = 240 }: { series: SeriesPoint[]; metric: MetricKey; height?: number }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const label = METRICS.find((m) => m.key === metric)!.label;
  const values = series.map((p) => p[metric]);
  const total = values.reduce((a, b) => a + b, 0);
  const peak = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
  const { max, step } = niceScale(Math.max(...values, 0));

  const margin = { top: 12, right: 4, bottom: 28, left: 40 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const band = series.length ? innerW / series.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const y = (v: number) => margin.top + innerH - (v / max) * innerH;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const labelEvery = width < 480 ? 10 : 7;

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - margin.left;
    if (x < 0 || x > innerW) return setActive(null);
    setActive(Math.min(series.length - 1, Math.max(0, Math.floor(x / band))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setActive((a) => {
        const cur = a ?? series.length - 1;
        return Math.min(series.length - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(series.length - 1);
  };

  const summary = total
    ? `${label} por dia nos últimos ${series.length} dias: ${formatNumber(total)} no total; maior dia ${dayLabel(series[peak].day)}, com ${formatNumber(values[peak])}. Use as setas para percorrer os dias.`
    : `${label}: nenhum registro nos últimos ${series.length} dias.`;

  const tip = active != null ? series[active] : null;
  const tipLeft = active != null ? margin.left + active * band + band / 2 : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onFocus={() => setActive((a) => a ?? series.length - 1)}
          onBlur={() => setActive(null)}
          className="block touch-pan-y rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <title id={titleId}>{summary}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={margin.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-subtle-foreground text-[11px] tabular-nums">
                {formatCompact(t)}
              </text>
            </g>
          ))}
          {active != null && <rect x={margin.left + active * band} y={margin.top} width={band} height={innerH} className="fill-foreground/[0.04]" />}
          {series.map((p, i) => {
            const v = p[metric];
            if (v <= 0) return null;
            const h = Math.max(2, (v / max) * innerH);
            const x = margin.left + i * band + (band - barW) / 2;
            return <path key={p.day} d={columnPath(x, margin.top + innerH - h, barW, h)} className={cn("transition-colors", active === i ? "fill-primary-hover" : "fill-primary")} />;
          })}
          {series.map((p, i) =>
            (i % labelEvery === 0 && i < series.length - labelEvery / 2) || i === series.length - 1 ? (
              <text key={p.day} x={margin.left + i * band + band / 2} y={height - 8} textAnchor={i === series.length - 1 ? "end" : "middle"} className="fill-subtle-foreground text-[11px]">
                {i === series.length - 1 ? "hoje" : dayLabel(p.day)}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {tip && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 min-w-32 -translate-x-1/2 rounded-xl border border-border bg-elevated px-3 py-2 shadow-float"
          style={{ left: Math.min(Math.max(tipLeft, 70), width - 70) }}
        >
          <p className="text-[17px] leading-tight font-extrabold tabular-nums">{formatNumber(tip[metric])}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{dayLabel(tip.day, true)}</p>
        </div>
      )}
      {!total && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-muted-foreground">Ainda sem registros neste período</div>
      )}
    </div>
  );
}

/** Gráfico diário com seletor de métrica e tabela acessível. */
export function MetricsChart({ series, locked }: { series: SeriesPoint[]; locked?: boolean }) {
  const [metric, setMetric] = useState<MetricKey>("views");
  const [table, setTable] = useState(false);
  const totals = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, series.reduce((s, p) => s + p[m.key], 0)])) as Record<MetricKey, number>,
    [series],
  );

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Métrica do gráfico" className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
        {METRICS.map((m) => {
          const on = m.key === metric;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked}
              onClick={() => setMetric(m.key)}
              className={cn(
                "flex min-h-11 shrink-0 flex-col items-start justify-center rounded-2xl border px-3.5 py-1.5 text-left transition",
                on ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong",
              )}
            >
              <span className={cn("text-xs font-semibold", on ? "text-primary" : "text-muted-foreground")}>{m.short}</span>
              <span className="text-[15px] font-bold tabular-nums">{formatNumber(totals[m.key])}</span>
            </button>
          );
        })}
      </div>
      <DailyColumns series={series} metric={metric} />
      {!locked && (
        <div>
          <button
            type="button"
            onClick={() => setTable((t) => !t)}
            aria-expanded={table}
            className="inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-semibold text-primary hover:underline"
          >
            <Table2 className="size-4" /> {table ? "Ocultar tabela" : "Ver dados em tabela"}
          </button>
          {table && (
            <div className="mt-2 max-h-80 overflow-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">Métricas por dia</caption>
                <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Dia
                    </th>
                    {METRICS.map((m) => (
                      <th key={m.key} scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                        {m.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((p) => (
                    <tr key={p.day} className="border-t border-border">
                      <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                        {dayLabel(p.day, true)}
                      </th>
                      {METRICS.map((m) => (
                        <td key={m.key} className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(p[m.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

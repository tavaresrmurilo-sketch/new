"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatBRL } from "@/lib/money";

type Granularity = "day" | "week" | "month";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function bucketLabel(bucket: string, granularity: Granularity, long = false): string {
  const [y, m, d] = bucket.split("-").map(Number);
  if (granularity === "month") return long ? `${MONTHS[m - 1]} de ${y}` : `${MONTHS[m - 1]}/${String(y).slice(2)}`;
  if (granularity === "week") return long ? `Semana de ${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]}`;
  return long ? `${d} de ${MONTHS[m - 1]} de ${y}` : `${d} ${MONTHS[m - 1]}`;
}

/** Máximo "redondo" para o eixo: 1, 2, 2,5 ou 5 × 10^k. */
function niceMax(value: number, ticks = 4): number {
  if (value <= 0) return 100;
  const rough = value / ticks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  return step * ticks;
}

function compactBRL(reais: number): string {
  if (reais >= 1000) return `R$ ${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `R$ ${reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

export interface RevenuePoint {
  bucket: string;
  revenueCents: number;
  orders: number;
}

/** Faturamento confirmado no período: linha + área, crosshair com tooltip e tabela equivalente. */
export function RevenueChart({ points, granularity }: { points: RevenuePoint[]; granularity: Granularity }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = 260;
  const m = { top: 16, right: 16, bottom: 30, left: width < 480 ? 58 : 72 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const maxReais = niceMax(Math.max(...points.map((p) => p.revenueCents / 100), 0));
  const ticks = [0, 1, 2, 3, 4].map((i) => (maxReais / 4) * i);
  const x = (i: number) => m.left + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (cents: number) => m.top + innerH - (cents / 100 / maxReais) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.revenueCents).toFixed(1)}`).join(" ");
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${m.top + innerH} L${x(0).toFixed(1)},${m.top + innerH} Z` : "";
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 72))));
  const total = points.reduce((sum, p) => sum + p.revenueCents, 0);
  const last = points.length - 1;
  const active = hover ?? null;

  const tooltipLeft = active != null ? Math.min(Math.max(x(active) - 80, 0), width - 160) : 0;

  return (
    <div>
      <div ref={wrap} className="relative w-full select-none" style={{ height }}>
        <svg width={width} height={height} role="img" aria-label={`Faturamento confirmado: ${formatBRL(total)} no período`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={width - m.right} y1={y(t * 100)} y2={y(t * 100)} stroke={t === 0 ? "var(--color-line-strong)" : "var(--color-line)"} strokeWidth={1} />
              <text x={m.left - 10} y={y(t * 100)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-muted)" className="tabular-nums">
                {compactBRL(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            (i % labelEvery === 0 && last - i >= Math.ceil(labelEvery * 0.75)) || i === last ? (
              <text key={p.bucket} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize={11} fill="var(--color-muted)">
                {bucketLabel(p.bucket, granularity)}
              </text>
            ) : null,
          )}
          <path d={area} fill="var(--color-accent)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.length > 0 && <circle cx={x(last)} cy={y(points[last].revenueCents)} r={4} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />}
          {active != null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={m.top} y2={m.top + innerH} stroke="var(--color-ink)" strokeOpacity={0.35} strokeWidth={1} />
              <circle cx={x(active)} cy={y(points[active].revenueCents)} r={5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
            </g>
          )}
          <rect
            x={m.left}
            y={m.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            tabIndex={0}
            aria-label="Explorar valores do gráfico com as setas"
            onPointerMove={(e) => {
              const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              setHover(Math.round(ratio * (points.length - 1)));
            }}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(last)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? last) - 1));
              if (e.key === "ArrowRight") setHover((h) => Math.min(last, (h ?? last) + 1));
            }}
          />
        </svg>
        {active != null && points[active] && (
          <div
            className="pointer-events-none absolute top-0 w-40 rounded-lg border border-line bg-surface px-3 py-2 shadow-pop"
            style={{ left: tooltipLeft }}
            role="status"
          >
            <p className="text-base font-semibold tabular-nums">{formatBRL(points[active].revenueCents)}</p>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-0.5 w-3 rounded bg-accent" />
              {points[active].orders} {points[active].orders === 1 ? "pedido" : "pedidos"}
            </p>
            <p className="mt-1 text-xs text-muted">{bucketLabel(points[active].bucket, granularity, true)}</p>
          </div>
        )}
      </div>
      {total === 0 && <p className="mt-2 text-sm text-muted">Nenhum pagamento confirmado neste período ainda.</p>}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">Ver dados em tabela</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-sunken">
              <tr>
                <th className="px-3 py-2 font-medium">Período</th>
                <th className="px-3 py-2 text-right font-medium">Pedidos pagos</th>
                <th className="px-3 py-2 text-right font-medium">Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.bucket} className="border-t border-line">
                  <td className="px-3 py-1.5">{bucketLabel(p.bucket, granularity, true)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{p.orders}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(p.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Barras horizontais de uma única série (cor única), com valores sempre visíveis. */
export function BarList({
  rows,
  valueLabel,
  empty = "Sem dados no período.",
}: {
  rows: Array<{ label: string; value: number; display: string; sub?: string }>;
  valueLabel: string;
  empty?: string;
}) {
  const max = useMemo(() => Math.max(...rows.map((r) => r.value), 0), [rows]);
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-3" aria-label={valueLabel}>
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{row.display}</span>
          </div>
          <div className="mt-1.5 h-2 w-full" aria-hidden="true">
            <div className="h-2 rounded-r-[4px] bg-accent" style={{ width: `${max ? Math.max(2, (row.value / max) * 100) : 0}%` }} />
          </div>
          {row.sub && <p className="mt-1 text-xs text-muted">{row.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

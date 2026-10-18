import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Variação percentual com sinal; null quando não há base de comparação. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Bloco de KPI: rótulo, valor e variação contra o período anterior. */
export function StatTile({
  label,
  value,
  previous,
  icon,
  hint,
  className,
}: {
  label: string;
  value: number;
  previous?: number;
  icon?: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  const delta = previous != null ? deltaPct(value, previous) : null;
  const up = delta != null && delta > 0;
  const down = delta != null && delta < 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5",
        className,
      )}
    >
      <div className="flex min-h-8 items-start justify-between gap-2">
        <span className="pt-1.5 text-[13px] leading-tight font-semibold text-muted-foreground">
          {label}
        </span>
        {icon && (
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <span
        className="mt-auto text-[28px] leading-none font-extrabold tracking-tight"
        title={formatNumber(value)}
      >
        {value >= 10_000 ? formatCompact(value) : formatNumber(value)}
      </span>
      <span className="flex min-h-5 items-center gap-1 text-xs font-semibold">
        {delta == null ? (
          <span className="text-subtle-foreground">
            {hint ??
              (previous === 0 && value > 0
                ? "Novo neste período"
                : "Sem período anterior")}
          </span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5",
                up && "text-success",
                down && "text-danger",
                !up && !down && "text-muted-foreground",
              )}
            >
              {up ? (
                <ArrowUpRight className="size-3.5" />
              ) : down ? (
                <ArrowDownRight className="size-3.5" />
              ) : (
                <Minus className="size-3.5" />
              )}
              {up ? "+" : ""}
              {delta}%
            </span>
            <span className="font-medium text-subtle-foreground">
              vs. 30 dias anteriores
            </span>
          </>
        )}
      </span>
    </div>
  );
}

/** Barra de uso (eventos ativos, destaques). */
export function UsageMeter({
  label,
  used,
  limit,
  unlimitedLabel = "Ilimitado",
}: {
  label: string;
  used: number;
  limit: number | null;
  unlimitedLabel?: string;
}) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone =
    pct >= 100 ? "bg-danger" : pct >= 67 ? "bg-warning" : "bg-primary";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {limit == null ? (
            <>
              <span className="font-bold text-foreground">{used}</span> ·{" "}
              {unlimitedLabel}
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">{used}</span> de{" "}
              {limit}
            </>
          )}
        </span>
      </div>
      {limit == null ? null : (
        <div
          className="h-2 overflow-hidden rounded-full bg-primary-soft"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
        >
          <div
            className={cn("h-full rounded-full transition-[width]", tone)}
            style={{ width: `${Math.max(pct, used > 0 ? 6 : 0)}%` }}
          />
        </div>
      )}
    </div>
  );
}

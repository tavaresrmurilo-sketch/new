import * as React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetricDelta {
  /** variação percentual em relação ao período anterior (null = sem base de comparação) */
  percent: number | null;
  /** true quando subir é bom (receita) e false quando subir é ruim (tarefas atrasadas) */
  higherIsBetter?: boolean;
  label?: string;
}

export function MetricCard({
  label,
  value,
  hint,
  delta,
  href,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  delta?: MetricDelta;
  href?: string;
  tone?: "default" | "danger" | "warning" | "success";
  className?: string;
}) {
  const content = (
    <div
      className={cn(
        "group flex h-full flex-col justify-between gap-2 rounded-lg border bg-card px-4 py-3.5 transition-colors",
        href && "hover:border-foreground/20 hover:bg-subtle/60",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
        {delta ? <DeltaPill delta={delta} /> : null}
      </div>
      <div
        className={cn(
          "tabular text-[22px] font-semibold leading-none tracking-tight",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
      {hint ? <div className="truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {content}
    </Link>
  ) : (
    content
  );
}

export function DeltaPill({ delta }: { delta: MetricDelta }) {
  if (delta.percent === null || !Number.isFinite(delta.percent)) {
    return <span className="text-[11px] text-muted-foreground" title="Sem base de comparação no período anterior">—</span>;
  }
  const up = delta.percent > 0;
  const flat = Math.abs(delta.percent) < 0.5;
  const good = flat ? null : up === (delta.higherIsBetter ?? true);
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 rounded px-1 text-[11px] font-medium",
        good === null && "text-muted-foreground",
        good === true && "text-success",
        good === false && "text-destructive",
      )}
      title={delta.label ?? "Comparado ao período anterior"}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(delta.percent).toFixed(0)}%
    </span>
  );
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

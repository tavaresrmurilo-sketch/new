import * as React from "react";
import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { ScoreRing } from "./badges";
import { cn } from "@/lib/utils";

export function HealthCard({ title, score, label, factors, footnote, className }: { title: string; score: number | null; label: string; factors: { label: string; impact: number }[]; footnote?: string; className?: string }) {
  const pos = factors.filter((f) => f.impact > 0);
  const neg = factors.filter((f) => f.impact < 0);
  const neutral = factors.filter((f) => f.impact === 0);
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex items-center gap-3">
        <ScoreRing score={score} label={title} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-base font-semibold">
            {score ?? "—"}
            <span className="text-muted-foreground">/100</span> · {label}
          </p>
        </div>
      </div>
      {factors.length ? (
        <ul className="mt-3 space-y-1 border-t pt-3 text-[13px]">
          {neg.map((f) => (
            <li key={f.label} className="flex items-center gap-2">
              <TrendingDown className="size-3.5 shrink-0 text-destructive" aria-hidden />
              <span className="flex-1">{f.label}</span>
              <span className="tabular text-xs text-destructive">{f.impact}</span>
            </li>
          ))}
          {pos.map((f) => (
            <li key={f.label} className="flex items-center gap-2">
              <TrendingUp className="size-3.5 shrink-0 text-success" aria-hidden />
              <span className="flex-1">{f.label}</span>
              <span className="tabular text-xs text-success">+{f.impact}</span>
            </li>
          ))}
          {neutral.map((f) => (
            <li key={f.label} className="flex items-center gap-2 text-muted-foreground">
              <span className="size-3.5" />
              <span className="flex-1">{f.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {footnote ? <p className="mt-3 text-[11px] text-muted-foreground">{footnote}</p> : null}
    </div>
  );
}

export function RecommendationsCard({ items, title = "Próxima melhor ação" }: { items: { action: string; reason: string; urgency: "high" | "medium" | "low" }[]; title?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Lightbulb className="size-3.5" aria-hidden /> {title}
      </p>
      <ul className="mt-2 space-y-2.5">
        {items.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", r.urgency === "high" ? "bg-destructive" : r.urgency === "medium" ? "bg-warning" : "bg-muted-foreground/40")}
              aria-label={`Urgência ${r.urgency === "high" ? "alta" : r.urgency === "medium" ? "média" : "baixa"}`}
            />
            <div>
              <p className="text-sm font-medium leading-snug">{r.action}</p>
              <p className="text-xs text-muted-foreground">{r.reason}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

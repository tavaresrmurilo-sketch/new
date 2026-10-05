import * as React from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUp, Equal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { labelOf, PRIORITY } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function StatusBadge({ map, value, className }: { map: Parameters<typeof labelOf>[0]; value: string | null | undefined; className?: string }) {
  const { label, tone } = labelOf(map, value);
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
}

const PRIORITY_ICON = { LOW: ArrowDown, MEDIUM: Equal, HIGH: ArrowUp, CRITICAL: ChevronsUp } as const;

export function PriorityBadge({ priority, recommended, className }: { priority: string; recommended?: boolean; className?: string }) {
  const { label, tone } = labelOf(PRIORITY, priority);
  const Icon = PRIORITY_ICON[priority as keyof typeof PRIORITY_ICON] ?? Equal;
  return (
    <Badge tone={tone} className={className} title={recommended ? "Prioridade recomendada pelo Smart Priority Engine" : undefined}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export function scoreTone(score: number | null | undefined): "success" | "warning" | "danger" | "neutral" {
  if (score === null || score === undefined) return "neutral";
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export function ScoreBadge({ score, label, className }: { score: number | null; label?: string; className?: string }) {
  if (score === null) return <Badge className={className}>Sem dados</Badge>;
  return (
    <Badge tone={scoreTone(score)} className={cn("tabular", className)}>
      {score}
      {label ? <span className="font-normal opacity-80">· {label}</span> : null}
    </Badge>
  );
}

/** Indicador circular 0–100 usado em saúde, Pulse e scores. */
export function ScoreRing({ score, size = 56, stroke = 5, label }: { score: number | null; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = score === null ? 0 : Math.max(0, Math.min(100, score));
  const tone = scoreTone(score);
  const color = { success: "stroke-success", warning: "stroke-warning", danger: "stroke-destructive", neutral: "stroke-muted-foreground" }[tone];
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Score"}: ${score ?? "sem dados"} de 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className={cn(color, "transition-all")}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
        />
      </svg>
      <span className="tabular absolute text-sm font-semibold">{score ?? "—"}</span>
    </div>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="warning">
      <AlertTriangle aria-hidden />
      Dados de demonstração
    </Badge>
  );
}

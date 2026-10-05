import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, Lightbulb, Sparkles, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type InsightTone = "info" | "opportunity" | "warning" | "critical" | "anomaly";

const TONES: Record<InsightTone, { icon: typeof Info; className: string; label: string }> = {
  info: { icon: Info, className: "text-info bg-info/10", label: "Informação" },
  opportunity: { icon: Lightbulb, className: "text-success bg-success/10", label: "Oportunidade" },
  warning: { icon: AlertTriangle, className: "text-warning bg-warning/10", label: "Atenção" },
  critical: { icon: AlertTriangle, className: "text-destructive bg-destructive/10", label: "Crítico" },
  anomaly: { icon: TrendingDown, className: "text-violet-600 dark:text-violet-300 bg-violet-500/10", label: "Possível anomalia" },
};

/** Cartão de insight. `evidence` explica de onde veio a conclusão (transparência — nunca "caixa-preta"). */
export function AIInsightCard({
  tone = "info",
  title,
  body,
  evidence,
  href,
  actionLabel,
  className,
  generatedBy = "rules",
}: {
  tone?: InsightTone;
  title: string;
  body?: React.ReactNode;
  evidence?: React.ReactNode;
  href?: string;
  actionLabel?: string;
  className?: string;
  generatedBy?: "rules" | "ai";
}) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div className={cn("flex gap-3 rounded-lg border bg-card p-4", className)}>
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md", t.className)}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span>{t.label}</span>
          {generatedBy === "ai" ? (
            <span className="inline-flex items-center gap-0.5 normal-case tracking-normal">
              <Sparkles className="size-3" aria-hidden /> Córtex AI
            </span>
          ) : null}
        </div>
        <p className="text-sm font-medium leading-snug">{title}</p>
        {body ? <div className="text-[13px] leading-relaxed text-muted-foreground">{body}</div> : null}
        {evidence ? <div className="pt-1 text-xs text-muted-foreground/90">Base: {evidence}</div> : null}
        {href ? (
          <Link href={href} className="inline-flex items-center gap-1 pt-1 text-[13px] font-medium text-primary hover:underline">
            {actionLabel ?? "Ver detalhes"} <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

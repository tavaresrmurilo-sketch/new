import { AlertTriangle, CheckCircle2, Info, OctagonAlert, Sparkles, type LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./badge";

export function PageHeader({ title, description, actions, badge }: { title: string; description?: string; actions?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export type Severity = "INFO" | "OPPORTUNITY" | "ATTENTION" | "CRITICAL";

export const SEVERITY_META: Record<Severity, { label: string; icon: LucideIcon; variant: "info" | "success" | "warning" | "critical" }> = {
  INFO: { label: "Informação", icon: Info, variant: "info" },
  OPPORTUNITY: { label: "Oportunidade", icon: Sparkles, variant: "success" },
  ATTENTION: { label: "Atenção", icon: AlertTriangle, variant: "warning" },
  CRITICAL: { label: "Crítico", icon: OctagonAlert, variant: "critical" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const m = SEVERITY_META[severity];
  const Icon = m.icon;
  return (
    <Badge variant={m.variant}>
      <Icon className="h-3 w-3" />
      {m.label}
    </Badge>
  );
}

export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
      {label}
    </span>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning" | "critical"; children: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-info/30 bg-info/5 text-foreground",
    warning: "border-warning/40 bg-warning/5 text-foreground",
    critical: "border-critical/40 bg-critical/5 text-foreground",
  }[tone];
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", styles, className)}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "info" ? "text-info" : tone === "warning" ? "text-warning" : "text-critical")} />
      <div>{children}</div>
    </div>
  );
}

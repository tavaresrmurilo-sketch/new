import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatValue, type ValueFmt } from "@/lib/format-value";
import { Card } from "@/components/ui/card";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Delta({ value, format = "pct", invert = false, suffix }: { value: number | null | undefined; format?: "pct" | "pp"; invert?: boolean; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">sem comparação</span>;
  const positive = value > 0;
  const good = invert ? !positive : positive;
  const Icon = value === 0 ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular", value === 0 ? "text-muted-foreground" : good ? "text-success" : "text-critical")}>
      <Icon className="h-3.5 w-3.5" />
      {format === "pp" ? fmt.pp(value) : fmt.signedPct(value)}
      {suffix ? <span className="ml-1 font-normal text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}

export function KpiCard({
  label, value, format = "money", delta, deltaFormat = "pct", deltaSuffix, hint, invert, className,
}: {
  label: string;
  value: number | string | null | undefined;
  format?: ValueFmt;
  delta?: number | null;
  deltaFormat?: "pct" | "pp";
  deltaSuffix?: string;
  hint?: React.ReactNode;
  invert?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-xl font-semibold tracking-tight tabular" title={formatValue(value as number, format)}>
        {formatValue(value as number, format)}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta !== undefined ? <Delta value={delta} format={deltaFormat} invert={invert} suffix={deltaSuffix} /> : null}
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
    </Card>
  );
}

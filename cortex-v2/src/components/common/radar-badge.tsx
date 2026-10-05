import { Flame, Snowflake, ThermometerSun, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const META = {
  HOT: { label: "Hot", tone: "success", icon: Flame },
  WARM: { label: "Warm", tone: "warning", icon: ThermometerSun },
  COLD: { label: "Cold", tone: "info", icon: Snowflake },
  AT_RISK: { label: "Em risco", tone: "danger", icon: TriangleAlert },
} as const;

export function RadarBadge({ category, score }: { category: keyof typeof META | null | undefined; score?: number | null }) {
  if (!category) return null;
  const m = META[category];
  return (
    <Badge tone={m.tone} title={`Opportunity Score: ${score ?? "—"}/100`}>
      <m.icon aria-hidden /> {m.label}
      {score !== undefined && score !== null ? <span className="tabular opacity-80">{score}</span> : null}
    </Badge>
  );
}

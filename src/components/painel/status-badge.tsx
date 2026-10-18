import { Ban, CalendarCheck2, CircleAlert, CircleCheck, Hourglass, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/misc";

export type PanelStatusValue = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "CANCELED" | "ARCHIVED" | "ENDED";

const MAP: Record<PanelStatusValue, { label: string; tone: React.ComponentProps<typeof Badge>["tone"]; icon: typeof Ban }> = {
  DRAFT: { label: "Rascunho", tone: "neutral", icon: PencilLine },
  PENDING_REVIEW: { label: "Em análise", tone: "warning", icon: Hourglass },
  PUBLISHED: { label: "Publicado", tone: "success", icon: CircleCheck },
  REJECTED: { label: "Recusado", tone: "danger", icon: CircleAlert },
  CANCELED: { label: "Cancelado", tone: "outline", icon: Ban },
  ARCHIVED: { label: "Encerrado", tone: "info", icon: CalendarCheck2 },
  ENDED: { label: "Encerrado", tone: "info", icon: CalendarCheck2 },
};

export function statusLabel(s: PanelStatusValue) {
  return MAP[s].label;
}

/** Selo de status do evento no painel (cor + ícone + texto, nunca só cor). */
export function StatusBadge({ status, className }: { status: PanelStatusValue; className?: string }) {
  const m = MAP[status];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone} className={className}>
      <Icon aria-hidden /> {m.label}
    </Badge>
  );
}

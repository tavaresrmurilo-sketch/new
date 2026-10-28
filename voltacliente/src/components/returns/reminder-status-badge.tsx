import { Badge } from "@/components/ui/badge";
import { relativeDayLabel } from "@/lib/dates";

const CLOSED_REASON: Record<string, string> = {
  DECLINED: "Sem interesse",
  OPTED_OUT: "Pediu para não receber",
  SUPERSEDED: "Substituído",
  NO_RETURN: "Retorno removido",
  MANUAL: "Encerrado",
};

export function ReminderStatusBadge({
  status,
  closedReason,
  remindAt,
  today,
}: {
  status: "PENDING" | "CONTACTED" | "CONVERTED" | "DISMISSED";
  closedReason?: string | null;
  remindAt: string;
  today: string;
}) {
  if (status === "CONVERTED") return <Badge variant="success">Retornou</Badge>;
  if (status === "DISMISSED") return <Badge variant="secondary">{CLOSED_REASON[closedReason ?? "MANUAL"] ?? "Encerrado"}</Badge>;
  if (status === "CONTACTED") return <Badge variant="info">Contatado</Badge>;
  if (remindAt < today) return <Badge variant="warning">Atrasado · {relativeDayLabel(remindAt, today)}</Badge>;
  if (remindAt === today) return <Badge variant="success">Hoje</Badge>;
  return <Badge variant="outline">{relativeDayLabel(remindAt, today)}</Badge>;
}

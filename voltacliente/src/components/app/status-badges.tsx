import { BanIcon, ShieldCheckIcon, ShieldQuestionIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ConsentBadge({ consent, doNotContact }: { consent: boolean; doNotContact: boolean }) {
  if (doNotContact)
    return (
      <Badge variant="danger">
        <BanIcon /> Não contatar
      </Badge>
    );
  if (consent)
    return (
      <Badge variant="success">
        <ShieldCheckIcon /> Autorizado
      </Badge>
    );
  return (
    <Badge variant="secondary">
      <ShieldQuestionIcon /> Sem consentimento
    </Badge>
  );
}

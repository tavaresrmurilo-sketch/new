import { Building2, ShieldCheck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const ACCOUNT_LABEL = { ADMIN: "Administrador", PERSON: "Pessoa", COMPANY: "Empresa" } as const;

export function AccountTypeBadge({ role }: { role: keyof typeof ACCOUNT_LABEL }) {
  const Icon = role === "ADMIN" ? ShieldCheck : role === "PERSON" ? User : Building2;
  return (
    <Badge variant={role === "ADMIN" ? "warning" : role === "PERSON" ? "info" : "secondary"}>
      <Icon className="h-3 w-3" /> {ACCOUNT_LABEL[role]}
    </Badge>
  );
}

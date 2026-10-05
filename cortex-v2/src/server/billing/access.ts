import type { SubscriptionStatus } from "@prisma/client";

export type AccessLevel = "FULL" | "READ_ONLY" | "BLOCKED";
export interface Access {
  level: AccessLevel;
  reason?: "blocked" | "trial_expired" | "past_due" | "canceled" | "suspended" | "support" | "pending_deletion";
  message?: string;
}

export const PAST_DUE_GRACE_DAYS = 7;

/**
 * Política de acesso por situação da assinatura. Dados nunca são apagados por inadimplência ou cancelamento:
 * o workspace fica somente leitura (exportação liberada) até o fim do período de retenção configurado.
 */
export function computeAccess(input: {
  blockedAt: Date | null;
  deletionRequestedAt: Date | null;
  subscription: { status: SubscriptionStatus; trialEndsAt: Date | null; currentPeriodEnd: Date | null } | null;
  now?: Date;
}): Access {
  const now = input.now ?? new Date();
  if (input.blockedAt) return { level: "BLOCKED", reason: "blocked", message: "Este workspace foi bloqueado pela administração da plataforma." };
  if (input.deletionRequestedAt)
    return { level: "READ_ONLY", reason: "pending_deletion", message: "A exclusão desta conta foi solicitada. O workspace está somente leitura." };
  const sub = input.subscription;
  if (!sub) return { level: "FULL" };
  switch (sub.status) {
    case "ACTIVE":
      return { level: "FULL" };
    case "TRIALING":
      if (sub.trialEndsAt && sub.trialEndsAt < now)
        return { level: "READ_ONLY", reason: "trial_expired", message: "Seu período de teste terminou. Escolha um plano para continuar editando." };
      return { level: "FULL" };
    case "PAST_DUE": {
      const end = sub.currentPeriodEnd ?? now;
      const graceEnd = new Date(end.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000);
      if (graceEnd > now) return { level: "FULL", reason: "past_due", message: "Há um pagamento pendente. Regularize para evitar restrições." };
      return { level: "READ_ONLY", reason: "past_due", message: "Pagamento pendente. O workspace está somente leitura até a regularização." };
    }
    case "CANCELED":
      return { level: "READ_ONLY", reason: "canceled", message: "Assinatura cancelada. Seus dados seguem disponíveis para consulta e exportação." };
    case "SUSPENDED":
      return { level: "BLOCKED", reason: "suspended", message: "Assinatura suspensa. Entre em contato com o suporte." };
  }
}

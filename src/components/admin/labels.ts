/** Rótulos e tons de status usados no /admin (isomórfico). */
export type Tone = "neutral" | "primary" | "accent" | "success" | "warning" | "danger" | "info" | "brand" | "outline";

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Ativa", tone: "success" },
  SUSPENDED: { label: "Suspensa", tone: "danger" },
  DELETED: { label: "Excluída", tone: "neutral" },
};

export const ORG_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Ativa", tone: "success" },
  SUSPENDED: { label: "Suspensa", tone: "danger" },
};

export const EVENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  PENDING_REVIEW: { label: "Em análise", tone: "warning" },
  PUBLISHED: { label: "Publicado", tone: "success" },
  REJECTED: { label: "Recusado", tone: "danger" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
  ARCHIVED: { label: "Encerrado", tone: "neutral" },
};

export const REPORT_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Aberta", tone: "warning" },
  RESOLVED: { label: "Resolvida", tone: "success" },
  DISMISSED: { label: "Descartada", tone: "neutral" },
};

export const EMAIL_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Na fila", tone: "info" },
  SENT: { label: "Enviado", tone: "success" },
  FAILED: { label: "Falhou", tone: "danger" },
  SKIPPED: { label: "Não enviado", tone: "neutral" },
};

export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  running: { label: "Em execução", tone: "info" },
  success: { label: "Concluída", tone: "success" },
  error: { label: "Falhou", tone: "danger" },
  interrupted: { label: "Interrompida", tone: "warning" },
};

export const SUBSCRIPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  TRIALING: { label: "Em teste", tone: "info" },
  ACTIVE: { label: "Ativa", tone: "success" },
  PAST_DUE: { label: "Pagamento pendente", tone: "warning" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
  INCOMPLETE: { label: "Incompleta", tone: "warning" },
  INCOMPLETE_EXPIRED: { label: "Expirada", tone: "neutral" },
  UNPAID: { label: "Não paga", tone: "danger" },
  PAUSED: { label: "Pausada", tone: "neutral" },
};

export const ORG_ROLE: Record<string, string> = { OWNER: "Proprietário(a)", ADMIN: "Administrador(a)", EDITOR: "Editor(a)" };

export const PLAN_LABEL: Record<string, string> = { FREE: "Gratuito", PRO: "Pro", BUSINESS: "Business" };

export const REJECTION_SUGGESTIONS = [
  "As informações estão incompletas: inclua descrição, horário e local exatos.",
  "A data ou o horário parecem incorretos. Confira e envie de novo.",
  "A imagem de capa não é adequada (baixa qualidade, texto em excesso ou conteúdo impróprio).",
  "O link de ingressos não é oficial ou não funciona.",
  "Não parece ser um evento aberto ao público.",
  "Conteúdo duplicado: este evento já está publicado.",
] as const;

/** Nomes amigáveis das ações registradas na auditoria (as desconhecidas aparecem como estão). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "moderation.approve": "Evento aprovado",
  "moderation.reject": "Evento recusado",
  "moderation.unpublish": "Evento retirado do ar",
  "moderation.report_resolve": "Denúncia resolvida",
  "moderation.report_dismiss": "Denúncia descartada",
  "admin.user.suspend": "Conta suspensa",
  "admin.user.reactivate": "Conta reativada",
  "admin.org.verify": "Selo verificado concedido",
  "admin.org.unverify": "Selo verificado removido",
  "admin.org.trust": "Organização marcada como confiável",
  "admin.org.untrust": "Confiança removida",
  "admin.org.suspend": "Organização suspensa",
  "admin.org.reactivate": "Organização reativada",
  "admin.org.plan_changed": "Plano alterado manualmente",
  "admin.category.create": "Categoria criada",
  "admin.category.update": "Categoria editada",
  "admin.plan.update": "Plano editado",
  "admin.settings.update": "Configurações alteradas",
  "admin.email.resend": "E-mail reenviado",
  "admin.job.run": "Rotina executada manualmente",
  "billing.plan_changed": "Plano alterado (Stripe)",
  "event.publish": "Evento publicado",
  "event.submit_review": "Evento enviado para análise",
  "report.created": "Denúncia recebida",
};

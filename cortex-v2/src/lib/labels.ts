import type { BadgeTone } from "@/components/ui/badge";

type LabelMap = Record<string, { label: string; tone: BadgeTone }>;

export const PROJECT_STATUS: LabelMap = {
  PLANNING: { label: "Planejamento", tone: "neutral" },
  ACTIVE: { label: "Ativo", tone: "primary" },
  PAUSED: { label: "Pausado", tone: "warning" },
  DELAYED: { label: "Atrasado", tone: "danger" },
  COMPLETED: { label: "Concluído", tone: "success" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};

export const TASK_STATUS: LabelMap = {
  TODO: { label: "A fazer", tone: "neutral" },
  IN_PROGRESS: { label: "Em andamento", tone: "primary" },
  BLOCKED: { label: "Bloqueada", tone: "danger" },
  DONE: { label: "Concluída", tone: "success" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
};

export const PRIORITY: LabelMap = {
  LOW: { label: "Baixa", tone: "neutral" },
  MEDIUM: { label: "Média", tone: "info" },
  HIGH: { label: "Alta", tone: "warning" },
  CRITICAL: { label: "Crítica", tone: "danger" },
};

export const LEAD_STATUS: LabelMap = {
  NEW: { label: "Novo", tone: "info" },
  CONTACTED: { label: "Contatado", tone: "primary" },
  QUALIFIED: { label: "Qualificado", tone: "success" },
  UNQUALIFIED: { label: "Desqualificado", tone: "neutral" },
  CONVERTED: { label: "Convertido", tone: "success" },
};

export const CLIENT_STATUS: LabelMap = {
  PROSPECT: { label: "Prospect", tone: "info" },
  ACTIVE: { label: "Ativo", tone: "success" },
  INACTIVE: { label: "Inativo", tone: "neutral" },
  CHURNED: { label: "Perdido", tone: "danger" },
};

export const OPPORTUNITY_STATUS: LabelMap = {
  OPEN: { label: "Em aberto", tone: "primary" },
  WON: { label: "Ganha", tone: "success" },
  LOST: { label: "Perdida", tone: "danger" },
};

export const PROPOSAL_STATUS: LabelMap = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  SENT: { label: "Enviada", tone: "info" },
  VIEWED: { label: "Visualizada", tone: "primary" },
  NEGOTIATION: { label: "Negociação", tone: "warning" },
  ACCEPTED: { label: "Aceita", tone: "success" },
  REJECTED: { label: "Recusada", tone: "danger" },
  EXPIRED: { label: "Expirada", tone: "neutral" },
};

export const CONTRACT_STATUS: LabelMap = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  ACTIVE: { label: "Ativo", tone: "success" },
  EXPIRED: { label: "Vencido", tone: "danger" },
  RENEWED: { label: "Renovado", tone: "info" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};

export const MEETING_STATUS: LabelMap = {
  SCHEDULED: { label: "Agendada", tone: "info" },
  DONE: { label: "Realizada", tone: "success" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
};

export const RISK_STATUS: LabelMap = {
  OPEN: { label: "Aberto", tone: "warning" },
  MITIGATING: { label: "Em mitigação", tone: "info" },
  CLOSED: { label: "Encerrado", tone: "neutral" },
  OCCURRED: { label: "Ocorrido", tone: "danger" },
};

export const RECEIVABLE_STATUS: LabelMap = {
  PENDING: { label: "A receber", tone: "info" },
  RECEIVED: { label: "Recebido", tone: "success" },
  CANCELED: { label: "Cancelado", tone: "neutral" },
};

export const DECISION_STATUS: LabelMap = {
  PENDING: { label: "Pendente", tone: "warning" },
  ACCEPTED: { label: "Aceita", tone: "success" },
  REJECTED: { label: "Recusada", tone: "danger" },
  DISMISSED: { label: "Descartada", tone: "neutral" },
};

export const SUBSCRIPTION_STATUS: LabelMap = {
  TRIALING: { label: "Em teste", tone: "info" },
  ACTIVE: { label: "Ativa", tone: "success" },
  PAST_DUE: { label: "Pagamento pendente", tone: "warning" },
  CANCELED: { label: "Cancelada", tone: "neutral" },
  SUSPENDED: { label: "Suspensa", tone: "danger" },
};

export const SOURCE_LABELS: Record<string, string> = {
  REFERRAL: "Indicação",
  WEBSITE: "Site",
  INBOUND: "Inbound",
  OUTBOUND: "Prospecção ativa",
  EVENT: "Evento",
  SOCIAL: "Redes sociais",
  PARTNER: "Parceiro",
  ADS: "Anúncios",
  OTHER: "Outro",
};

export const DECISION_ROLE: LabelMap = {
  DECISION_MAKER: { label: "Decisor", tone: "primary" },
  INFLUENCER: { label: "Influenciador", tone: "info" },
  CHAMPION: { label: "Champion", tone: "success" },
  BLOCKER: { label: "Bloqueador", tone: "danger" },
  USER: { label: "Usuário", tone: "neutral" },
  UNKNOWN: { label: "Indefinido", tone: "outline" },
};

export const CLOSE_REASON: Record<string, string> = {
  PRICE: "Preço",
  COMPETITOR: "Concorrente",
  TIMING: "Timing",
  NO_BUDGET: "Sem orçamento",
  POOR_FIT: "Solução inadequada",
  NO_RESPONSE: "Não respondeu",
  TRUST: "Confiança",
  RELATIONSHIP: "Relacionamento",
  TECHNICAL_QUALITY: "Qualidade técnica",
  DEADLINE: "Prazo",
  REFERRAL: "Indicação",
  REPUTATION: "Reputação",
  OTHER: "Outro",
};

export const LOSS_REASONS = ["PRICE", "COMPETITOR", "TIMING", "NO_BUDGET", "POOR_FIT", "NO_RESPONSE", "TRUST", "OTHER"] as const;
export const WIN_REASONS = ["PRICE", "RELATIONSHIP", "TECHNICAL_QUALITY", "DEADLINE", "REFERRAL", "REPUTATION", "TRUST", "OTHER"] as const;

export const DOCUMENT_CATEGORY: Record<string, string> = {
  CONTRACT: "Contratos",
  PROPOSAL: "Propostas",
  REPORT: "Relatórios",
  PROJECT: "Projetos",
  IMAGE: "Imagens",
  TECHNICAL: "Documentos técnicos",
  OTHER: "Outros",
};

export const CHANNEL_LABELS: Record<string, string> = {
  CALL: "Ligação",
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  MEETING: "Reunião",
  VISIT: "Visita",
  NOTE: "Nota",
  ISSUE: "Problema registrado",
};

export const RECURRENCE_LABELS: Record<string, string> = {
  ONE_TIME: "Pagamento único",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

export const RENEWAL_LABELS: Record<string, string> = {
  AUTOMATIC: "Renovação automática",
  MANUAL: "Renovação negociada",
  NONE: "Sem renovação",
};

export const MEMORY_CATEGORY: Record<string, string> = {
  PREFERENCE: "Preferência",
  REQUIREMENT: "Exigência",
  DEPENDENCY: "Dependência",
  CONTEXT: "Contexto",
  OTHER: "Outro",
};

export const MEMORY_SOURCE: Record<string, string> = {
  MANUAL: "Registro manual",
  MEETING: "Reunião",
  AI_CONFIRMED: "Sugestão da IA confirmada",
  IMPORT: "Importação",
};

export const IMPACT_LABELS = ["", "Baixo", "Médio", "Alto", "Crítico"];
export const PROBABILITY_LABELS = ["", "Rara", "Possível", "Provável", "Quase certa"];

export function labelOf(map: LabelMap, key: string | null | undefined) {
  return (key && map[key]) || { label: key ?? "—", tone: "neutral" as BadgeTone };
}

export const DECISION_TYPE: Record<string, { label: string; accept: string; reject: string }> = {
  APPROVE_PROPOSAL: { label: "Aprovação de proposta", accept: "Aprovar e enviar", reject: "Recusar envio" },
  RESOLVE_DUPLICATE: { label: "Possível duplicidade", accept: "Mesclar registros", reject: "Não é duplicado" },
  REVIEW_PROJECT_RISK: { label: "Risco crítico de projeto", accept: "Ciente — iniciar mitigação", reject: "Descartar alerta" },
  CONFIRM_AI_TASKS: { label: "Tarefas sugeridas pela IA", accept: "Confirmar", reject: "Descartar" },
  ACCEPT_SUGGESTION: { label: "Sugestão do Córtex", accept: "Aceitar", reject: "Recusar" },
  CONFIRM_MEMORY: { label: "Confirmar memória", accept: "Confirmar", reject: "Descartar" },
};

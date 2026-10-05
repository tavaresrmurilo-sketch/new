/** Recursos controlados por plano (FeatureGate). As chaves ficam em Plan.features. */
export const FEATURES = {
  ai_assistant: "Córtex AI (assistente, resumos e gerador de propostas)",
  automations: "Automações (WHEN / IF / THEN)",
  playbooks: "Córtex Playbooks",
  webhooks: "Webhooks",
  api_access: "API pública e API keys",
  executive_report: "Relatório Executivo em PDF",
  xlsx_export: "Exportação XLSX",
  client_portal: "Portal do Cliente",
  custom_roles: "Papéis e permissões personalizados",
  integrations: "Integrações externas",
  audit_log: "Log de auditoria completo",
} as const;

export type FeatureKey = keyof typeof FEATURES;

/** Limites quantitativos (UsageLimit). null no plano = ilimitado. */
export const LIMITS = {
  users: { label: "Usuários", planField: "maxUsers" },
  storage_mb: { label: "Armazenamento (MB)", planField: "maxStorageMb" },
  automations: { label: "Automações ativas", planField: "maxAutomations" },
  ai_requests: { label: "Requisições de IA por mês", planField: "maxAiRequestsMonth" },
  api_keys: { label: "API keys ativas", planField: "maxApiKeys" },
  webhooks: { label: "Webhooks", planField: "maxWebhooks" },
} as const;

export type LimitKey = keyof typeof LIMITS;

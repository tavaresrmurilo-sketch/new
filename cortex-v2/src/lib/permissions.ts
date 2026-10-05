/** Catálogo de permissões granulares (compartilhado entre servidor e interface). */
export const PERMISSIONS = {
  "clients.read": { group: "Clientes", description: "Visualizar clientes e contatos" },
  "clients.write": { group: "Clientes", description: "Criar e editar clientes e contatos" },
  "clients.delete": { group: "Clientes", description: "Excluir clientes e contatos" },
  "leads.read": { group: "Leads", description: "Visualizar leads" },
  "leads.write": { group: "Leads", description: "Criar, editar e converter leads" },
  "leads.delete": { group: "Leads", description: "Excluir leads" },
  "opportunities.read": { group: "Oportunidades", description: "Visualizar oportunidades e pipeline" },
  "opportunities.write": { group: "Oportunidades", description: "Criar, editar e mover oportunidades" },
  "opportunities.delete": { group: "Oportunidades", description: "Excluir oportunidades" },
  "projects.read": { group: "Projetos", description: "Visualizar projetos" },
  "projects.write": { group: "Projetos", description: "Criar e editar projetos e riscos" },
  "projects.delete": { group: "Projetos", description: "Excluir projetos" },
  "tasks.read": { group: "Tarefas", description: "Visualizar tarefas" },
  "tasks.write": { group: "Tarefas", description: "Criar e editar tarefas" },
  "tasks.delete": { group: "Tarefas", description: "Excluir tarefas" },
  "meetings.read": { group: "Reuniões", description: "Visualizar reuniões" },
  "meetings.write": { group: "Reuniões", description: "Criar e editar reuniões" },
  "meetings.delete": { group: "Reuniões", description: "Excluir reuniões" },
  "proposals.read": { group: "Propostas", description: "Visualizar propostas" },
  "proposals.write": { group: "Propostas", description: "Criar e editar propostas" },
  "proposals.delete": { group: "Propostas", description: "Excluir propostas" },
  "proposals.approve": { group: "Propostas", description: "Aprovar propostas na Central de Decisões" },
  "contracts.read": { group: "Contratos", description: "Visualizar contratos" },
  "contracts.write": { group: "Contratos", description: "Criar e editar contratos" },
  "contracts.delete": { group: "Contratos", description: "Excluir contratos" },
  "documents.read": { group: "Documentos", description: "Visualizar e baixar documentos" },
  "documents.write": { group: "Documentos", description: "Enviar e editar documentos" },
  "documents.delete": { group: "Documentos", description: "Excluir documentos" },
  "finance.read": { group: "Financeiro", description: "Visualizar valores, receita e previsões" },
  "finance.write": { group: "Financeiro", description: "Registrar recebíveis e alterações financeiras" },
  "reports.read": { group: "Relatórios", description: "Visualizar relatórios e insights" },
  "reports.export": { group: "Relatórios", description: "Exportar relatórios (PDF, CSV, XLSX)" },
  "team.read": { group: "Equipe", description: "Visualizar equipe e capacidade" },
  "users.manage": { group: "Administração", description: "Convidar, editar e desativar usuários" },
  "roles.manage": { group: "Administração", description: "Alterar papéis e permissões" },
  "settings.manage": { group: "Administração", description: "Alterar configurações da empresa e pipeline" },
  "billing.manage": { group: "Administração", description: "Gerenciar plano e assinatura" },
  "integrations.manage": { group: "Administração", description: "Gerenciar webhooks, API keys e integrações" },
  "audit.read": { group: "Administração", description: "Visualizar log de auditoria" },
  "data.import": { group: "Dados", description: "Importar clientes e leads" },
  "data.export": { group: "Dados", description: "Exportar todos os dados da empresa (LGPD)" },
  "trash.manage": { group: "Dados", description: "Restaurar e excluir definitivamente itens da lixeira" },
  "organization.delete": { group: "Dados", description: "Solicitar exclusão da conta da empresa" },
  "automations.manage": { group: "Automação", description: "Criar e editar automações" },
  "playbooks.manage": { group: "Automação", description: "Criar e editar playbooks" },
  "playbooks.run": { group: "Automação", description: "Iniciar playbooks" },
  "ai.use": { group: "Córtex AI", description: "Usar o Córtex AI e o Command Center" },
  "memory.write": { group: "Córtex AI", description: "Registrar e editar fatos na Córtex Memory" },
  "decisions.resolve": { group: "Córtex AI", description: "Resolver itens da Central de Decisões" },
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SYSTEM_ROLES = ["OWNER", "ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

const READ_ALL: Permission[] = ALL_PERMISSIONS.filter((p) => p.endsWith(".read"));

export const ROLE_DEFAULTS: Record<SystemRole, { name: string; description: string; permissions: Permission[] }> = {
  OWNER: {
    name: "Proprietário",
    description: "Acesso total ao workspace, incluindo assinatura e exclusão da conta.",
    permissions: [...ALL_PERMISSIONS],
  },
  ADMIN: {
    name: "Administrador",
    description: "Administra usuários, configurações e integrações. Não altera assinatura nem exclui a conta.",
    permissions: ALL_PERMISSIONS.filter((p) => p !== "billing.manage" && p !== "organization.delete"),
  },
  MANAGER: {
    name: "Gestor",
    description: "Gerencia equipe, operação comercial e projetos.",
    permissions: [
      ...READ_ALL.filter((p) => p !== "audit.read"),
      "clients.write", "clients.delete", "leads.write", "leads.delete",
      "opportunities.write", "opportunities.delete", "projects.write", "projects.delete",
      "tasks.write", "tasks.delete", "meetings.write", "meetings.delete",
      "proposals.write", "proposals.delete", "proposals.approve", "contracts.write",
      "documents.write", "documents.delete", "finance.write", "reports.export",
      "automations.manage", "playbooks.manage", "playbooks.run", "ai.use", "memory.write",
      "decisions.resolve", "data.import",
    ],
  },
  MEMBER: {
    name: "Membro",
    description: "Executa o dia a dia: leads, clientes, oportunidades, tarefas e reuniões.",
    permissions: [
      "clients.read", "clients.write", "leads.read", "leads.write", "opportunities.read", "opportunities.write",
      "projects.read", "tasks.read", "tasks.write", "meetings.read", "meetings.write", "proposals.read",
      "proposals.write", "contracts.read", "documents.read", "documents.write", "reports.read", "team.read",
      "playbooks.run", "ai.use", "memory.write", "decisions.resolve",
    ],
  },
  VIEWER: {
    name: "Leitor",
    description: "Somente visualização. Não vê valores financeiros consolidados.",
    permissions: READ_ALL.filter((p) => p !== "finance.read" && p !== "audit.read"),
  },
};

export function roleLabel(key: string, fallback?: string): string {
  return (ROLE_DEFAULTS as Record<string, { name: string }>)[key]?.name ?? fallback ?? key;
}

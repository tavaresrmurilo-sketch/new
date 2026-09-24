import type { RoleKey } from "@prisma/client";

export const PERMISSIONS = {
  "dashboard:view": { module: "Visão Executiva", description: "Visualizar a visão executiva" },
  "chat:use": { module: "Pergunte ao Cortex", description: "Conversar com o Cortex" },
  "insights:view": { module: "Insights", description: "Visualizar insights" },
  "dre:view": { module: "Financeiro", description: "Visualizar DRE" },
  "cashflow:view": { module: "Financeiro", description: "Visualizar fluxo de caixa" },
  "payables:view": { module: "Financeiro", description: "Visualizar contas a pagar" },
  "receivables:view": { module: "Financeiro", description: "Visualizar contas a receber" },
  "payroll:view": { module: "Financeiro", description: "Visualizar despesas de pessoal/folha salarial" },
  "sales:view": { module: "Comercial", description: "Visualizar vendas" },
  "customers:view": { module: "Comercial", description: "Visualizar clientes" },
  "products:view": { module: "Comercial", description: "Visualizar produtos" },
  "sellers:view": { module: "Comercial", description: "Visualizar vendedores" },
  "forecasts:view": { module: "Projeções", description: "Visualizar projeções" },
  "scenarios:use": { module: "Cenários", description: "Usar o simulador de cenários" },
  "reports:view": { module: "Relatórios", description: "Visualizar relatórios" },
  "reports:export": { module: "Relatórios", description: "Exportar relatórios (PDF/Excel/CSV)" },
  "cortex:view": { module: "Cortex", description: "Visualizar o núcleo de dados" },
  "knowledge:manage": { module: "Cortex", description: "Gerenciar Cortex Knowledge" },
  "integrations:view": { module: "Integrações", description: "Visualizar integrações" },
  "integrations:manage": { module: "Integrações", description: "Criar/alterar integrações e credenciais" },
  "import:run": { module: "Integrações", description: "Importar planilhas CSV/XLSX" },
  "audit:view": { module: "Auditoria", description: "Visualizar audit log" },
  "settings:manage": { module: "Configurações", description: "Alterar configurações da empresa" },
  "users:manage": { module: "Configurações", description: "Gerenciar usuários" },
  "privacy:manage": { module: "Configurações", description: "Exportação/exclusão de dados (LGPD)" },
  "platform:admin": { module: "JR Admin", description: "Painel administrativo da plataforma" },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

const ALL_TENANT = (Object.keys(PERMISSIONS) as PermissionKey[]).filter((p) => p !== "platform:admin");

const VIEW_ALL: PermissionKey[] = [
  "dashboard:view", "chat:use", "insights:view", "dre:view", "cashflow:view", "payables:view",
  "receivables:view", "sales:view", "customers:view", "products:view", "sellers:view",
  "forecasts:view", "scenarios:use", "reports:view", "cortex:view", "integrations:view",
];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: ["platform:admin"],
  ADMIN_CLIENTE: ALL_TENANT,
  DIRETOR: [...VIEW_ALL, "payroll:view", "reports:export", "knowledge:manage", "audit:view"],
  FINANCEIRO: [
    "dashboard:view", "chat:use", "insights:view", "dre:view", "cashflow:view", "payables:view",
    "receivables:view", "payroll:view", "sales:view", "customers:view", "forecasts:view",
    "scenarios:use", "reports:view", "reports:export", "cortex:view", "integrations:view", "import:run",
  ],
  COMERCIAL: [
    "dashboard:view", "chat:use", "insights:view", "sales:view", "customers:view", "products:view",
    "sellers:view", "receivables:view", "forecasts:view", "reports:view", "reports:export",
  ],
  ANALISTA: [...VIEW_ALL, "reports:export", "import:run", "knowledge:manage"],
  VIEWER: ["dashboard:view", "chat:use", "insights:view", "sales:view", "reports:view"],
};

/** Permissões concedidas ao suporte JR durante uma autorização explícita do cliente (somente leitura). */
export const SUPPORT_PERMISSIONS: PermissionKey[] = ["dashboard:view", "cortex:view", "integrations:view", "insights:view"];

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin (JR)",
  ADMIN_CLIENTE: "Administrador",
  DIRETOR: "Diretor",
  FINANCEIRO: "Financeiro",
  COMERCIAL: "Comercial",
  ANALISTA: "Analista",
  VIEWER: "Visualizador",
};

export const ASSIGNABLE_ROLES: RoleKey[] = ["ADMIN_CLIENTE", "DIRETOR", "FINANCEIRO", "COMERCIAL", "ANALISTA", "VIEWER"];

import {
  Activity, BarChart3, Bot, Brain, Briefcase, Calculator, CalendarDays, CheckSquare, FileSignature, FileText,
  FolderKanban, Gauge, Inbox, KanbanSquare, LayoutDashboard, Lightbulb, ListChecks, type LucideIcon, Radar,
  Scale, Settings, Sparkles, Target, Trash2, UserPlus, Users, Users2, Video, Wallet, Workflow, Zap, FolderOpen,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  badgeKey?: "inbox" | "decisions";
  /** atalho exibido na command palette */
  keywords?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Visão geral",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, keywords: ["início", "home", "morning brief"] },
      { label: "Inbox", href: "/app/inbox", icon: Inbox, badgeKey: "inbox", keywords: ["notificações", "pendências"] },
      { label: "Executive Cockpit", href: "/app/cockpit", icon: Gauge, permission: "reports.read", keywords: ["diretoria", "estratégico"] },
      { label: "Córtex AI", href: "/app/ai", icon: Sparkles, permission: "ai.use", keywords: ["assistente", "perguntar", "chat", "comando"] },
    ],
  },
  {
    label: "Comercial",
    items: [
      { label: "Leads", href: "/app/leads", icon: UserPlus, permission: "leads.read" },
      { label: "Clientes", href: "/app/clients", icon: Users, permission: "clients.read", keywords: ["empresas", "contas"] },
      { label: "Oportunidades", href: "/app/opportunities", icon: Target, permission: "opportunities.read", keywords: ["negócios", "deals"] },
      { label: "Pipeline", href: "/app/pipeline", icon: KanbanSquare, permission: "opportunities.read", keywords: ["kanban", "funil"] },
      { label: "Opportunity Radar", href: "/app/opportunities/radar", icon: Radar, permission: "opportunities.read", keywords: ["score", "hot"] },
      { label: "Propostas", href: "/app/proposals", icon: FileText, permission: "proposals.read" },
      { label: "Contratos", href: "/app/contracts", icon: FileSignature, permission: "contracts.read" },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Projetos", href: "/app/projects", icon: FolderKanban, permission: "projects.read" },
      { label: "Tarefas", href: "/app/tasks", icon: CheckSquare, permission: "tasks.read" },
      { label: "Calendário", href: "/app/calendar", icon: CalendarDays, permission: "tasks.read" },
      { label: "Reuniões", href: "/app/meetings", icon: Video, permission: "meetings.read" },
      { label: "Documentos", href: "/app/documents", icon: FolderOpen, permission: "documents.read" },
      { label: "Equipe", href: "/app/team", icon: Users2, permission: "team.read", keywords: ["capacidade", "workload"] },
    ],
  },
  {
    label: "Inteligência",
    items: [
      { label: "Insights", href: "/app/insights", icon: Lightbulb, permission: "reports.read", keywords: ["pulse", "anomalias", "padrões"] },
      { label: "Central de Decisões", href: "/app/decisions", icon: Scale, badgeKey: "decisions", keywords: ["aprovar"] },
      { label: "Financeiro", href: "/app/finance", icon: Wallet, permission: "finance.read", keywords: ["receita", "forecast", "previsão"] },
      { label: "Relatórios", href: "/app/reports", icon: BarChart3, permission: "reports.read", keywords: ["executivo", "win loss", "exportar"] },
      { label: "Córtex Memory", href: "/app/memory", icon: Brain, permission: "clients.read", keywords: ["fatos", "memória"] },
    ],
  },
  {
    label: "Automação",
    items: [
      { label: "Automações", href: "/app/automations", icon: Zap, permission: "automations.manage" },
      { label: "Playbooks", href: "/app/playbooks", icon: ListChecks, permission: "playbooks.run" },
    ],
  },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Calculadora de ROI", href: "/app/tools/roi", icon: Calculator, keywords: ["retorno", "payback"] },
  { label: "Atividades", href: "/app/activity", icon: Activity, keywords: ["feed", "histórico"] },
  { label: "Lixeira", href: "/app/trash", icon: Trash2, permission: "trash.manage" },
  { label: "Configurações", href: "/app/settings", icon: Settings },
];

export const ALL_NAV_ITEMS: NavItem[] = [...NAV.flatMap((s) => s.items), ...SECONDARY_NAV];

export const BREADCRUMB_LABELS: Record<string, string> = {
  app: "Início",
  dashboard: "Dashboard",
  inbox: "Inbox",
  cockpit: "Executive Cockpit",
  ai: "Córtex AI",
  leads: "Leads",
  clients: "Clientes",
  opportunities: "Oportunidades",
  radar: "Radar",
  pipeline: "Pipeline",
  proposals: "Propostas",
  contracts: "Contratos",
  projects: "Projetos",
  tasks: "Tarefas",
  calendar: "Calendário",
  meetings: "Reuniões",
  documents: "Documentos",
  team: "Equipe",
  insights: "Insights",
  decisions: "Central de Decisões",
  finance: "Financeiro",
  reports: "Relatórios",
  memory: "Córtex Memory",
  automations: "Automações",
  playbooks: "Playbooks",
  tools: "Ferramentas",
  roi: "Calculadora de ROI",
  activity: "Atividades",
  trash: "Lixeira",
  settings: "Configurações",
  profile: "Perfil",
  company: "Empresa",
  permissions: "Permissões",
  notifications: "Notificações",
  integrations: "Integrações",
  security: "Segurança",
  billing: "Plano e assinatura",
  webhooks: "Webhooks",
  "api-keys": "API keys",
  audit: "Auditoria",
  privacy: "Privacidade e LGPD",
  import: "Importar",
  tags: "Tags",
  new: "Novo",
  onboarding: "Primeiros passos",
  executive: "Relatório Executivo",
  "win-loss": "Win/Loss",
  edit: "Editar",
  workload: "Mapa de Capacidade",
  portal: "Portal do Cliente",
};

export const CREATE_ICON: Record<string, LucideIcon> = {
  client: Users,
  lead: UserPlus,
  opportunity: Target,
  project: FolderKanban,
  task: CheckSquare,
  meeting: Video,
  proposal: FileText,
  contract: FileSignature,
};

export const AI_ICON = Bot;
export const DEAL_ICON = Briefcase;

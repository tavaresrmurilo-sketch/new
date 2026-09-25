import type { PermissionKey } from "@/server/auth/permissions";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission: PermissionKey;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Visão Executiva", icon: "LayoutDashboard", permission: "dashboard:view" },
      { href: "/chat", label: "Pergunte ao Cortex", icon: "MessageSquareText", permission: "chat:use" },
      { href: "/insights", label: "Insights", icon: "Lightbulb", permission: "insights:view" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/financeiro/dre", label: "DRE", icon: "FileSpreadsheet", permission: "dre:view" },
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: "Wallet", permission: "cashflow:view" },
      { href: "/financeiro/contas-a-pagar", label: "Contas a Pagar", icon: "ArrowUpFromLine", permission: "payables:view" },
      { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icon: "ArrowDownToLine", permission: "receivables:view" },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/comercial/vendas", label: "Vendas", icon: "TrendingUp", permission: "sales:view" },
      { href: "/comercial/clientes", label: "Clientes", icon: "Users", permission: "customers:view" },
      { href: "/comercial/produtos", label: "Produtos", icon: "Package", permission: "products:view" },
      { href: "/comercial/vendedores", label: "Vendedores", icon: "BadgeCheck", permission: "sellers:view" },
    ],
  },
  {
    label: "Planejamento",
    items: [
      { href: "/projecoes", label: "Projeções", icon: "LineChart", permission: "forecasts:view" },
      { href: "/cenarios", label: "Cenários", icon: "SlidersHorizontal", permission: "scenarios:use" },
      { href: "/relatorios", label: "Relatórios", icon: "FileText", permission: "reports:view" },
      { href: "/reuniao", label: "Prepare minha reunião", icon: "CalendarCheck", permission: "reports:view" },
    ],
  },
  {
    label: "Dados",
    items: [
      { href: "/cortex", label: "Cortex", icon: "BrainCircuit", permission: "cortex:view" },
      { href: "/integracoes", label: "Conectar Dados", icon: "Plug", permission: "integrations:view" },
      { href: "/auditoria", label: "Auditoria", icon: "ShieldCheck", permission: "audit:view" },
      { href: "/configuracoes", label: "Configurações", icon: "Settings", permission: "settings:manage" },
    ],
  },
];

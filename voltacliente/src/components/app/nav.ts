import {
  BellRingIcon,
  CalendarCheckIcon,
  ChartColumnIcon,
  LayoutDashboardIcon,
  MessageSquareTextIcon,
  SettingsIcon,
  UsersIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badgeKey?: "returns" };

export const NAV_ITEMS: NavItem[] = [
  { href: "/painel", label: "Painel", icon: LayoutDashboardIcon },
  { href: "/retornos", label: "Central de retornos", icon: BellRingIcon, badgeKey: "returns" },
  { href: "/clientes", label: "Clientes", icon: UsersIcon },
  { href: "/atendimentos", label: "Atendimentos", icon: CalendarCheckIcon },
  { href: "/servicos", label: "Serviços", icon: WrenchIcon },
  { href: "/mensagens", label: "Mensagens", icon: MessageSquareTextIcon },
  { href: "/relatorios", label: "Relatórios", icon: ChartColumnIcon },
  { href: "/configuracoes", label: "Configurações", icon: SettingsIcon },
];

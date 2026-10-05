import type { Permission } from "@/lib/permissions";
import { PageHeader } from "@/components/common/page-header";
import { SettingsNav } from "@/features/settings/components/settings-nav";
import { can, requireCtx } from "@/server/auth/context";

const ITEMS: { href: string; label: string; perm?: Permission }[] = [
  { href: "/app/settings/profile", label: "Perfil" },
  { href: "/app/settings/security", label: "Segurança" },
  { href: "/app/settings/notifications", label: "Notificações" },
  { href: "/app/settings/company", label: "Empresa", perm: "settings.manage" },
  { href: "/app/settings/team", label: "Equipe", perm: "users.manage" },
  { href: "/app/settings/permissions", label: "Permissões", perm: "roles.manage" },
  { href: "/app/settings/pipeline", label: "Pipeline", perm: "settings.manage" },
  { href: "/app/settings/ai", label: "Córtex AI", perm: "settings.manage" },
  { href: "/app/settings/integrations", label: "Integrações e API", perm: "integrations.manage" },
  { href: "/app/settings/import", label: "Importar dados", perm: "data.import" },
  { href: "/app/settings/billing", label: "Plano e cobrança", perm: "billing.manage" },
  { href: "/app/settings/audit", label: "Auditoria", perm: "audit.read" },
  { href: "/app/settings/privacy", label: "Privacidade (LGPD)" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  return (
    <div className="space-y-5">
      <PageHeader title="Configurações" />
      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsNav items={ITEMS.filter((i) => !i.perm || can(ctx, i.perm)).map(({ href, label }) => ({ href, label }))} />
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
}

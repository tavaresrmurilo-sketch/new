import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { NAV } from "@/components/layout/nav";
import { requirePage } from "@/server/auth/guard";
import { ROLE_LABELS } from "@/server/auth/permissions";
import { accountLabels } from "@/lib/account-labels";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePage();
  const labels = accountLabels(ctx.tenantKind);
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => ctx.permissions.has(i.permission)).map((i) => (i.href === "/dashboard" ? { ...i, label: labels.homeTitle } : i)),
  })).filter((g) => g.items.length);
  return (
    <div className="min-h-screen">
      <Sidebar groups={groups} tenantName={ctx.tenantName} />
      <div className="lg:pl-60">
        <Topbar
          groups={groups}
          userName={ctx.userName}
          userEmail={ctx.userEmail}
          roleLabel={ctx.supportMode ? "Suporte JR (somente leitura)" : labels.personal ? "Conta pessoal" : ROLE_LABELS[ctx.role]}
          tenantName={ctx.tenantName}
          isDemo={ctx.isDemo}
          supportMode={ctx.supportMode}
        />
        {ctx.isDemo ? (
          <div className="border-b border-brand-gold/30 bg-brand-gold/10 px-4 py-1.5 text-center text-xs text-foreground/80 lg:px-6">
            Você está visualizando o ambiente <strong>JR Demo</strong> com <strong>DADOS DEMONSTRATIVOS</strong> fictícios. Nenhum valor representa uma empresa real.
          </div>
        ) : null}
        {!ctx.onboardingCompleted && !ctx.isDemo ? (
          <div className="border-b bg-info/5 px-4 py-1.5 text-center text-xs lg:px-6">
            Seu Cortex ainda não tem dados.{" "}
            <Link href="/onboarding" className="font-medium text-primary underline-offset-2 hover:underline">
              Concluir configuração inicial
            </Link>
          </div>
        ) : null}
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}

import { ArrowRight, CalendarCheck, CircleDollarSign, Flag, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DailyChart } from "@/components/admin/daily-chart";
import { AdminPage, Panel, StatCard } from "@/components/admin/ui";
import { getAdminOverview } from "@/server/admin/overview";
import { requireAdmin } from "@/server/auth/guards";
import { integrations } from "@/server/env";
import { formatLongDate, formatMoney, formatNumber, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Visão geral" };

function QueueCard({ href, icon, label, count, empty, detail, tone }: { href: string; icon: React.ReactNode; label: string; count: number; empty: string; detail?: string; tone: "warning" | "danger" | "primary" }) {
  const hot = count > 0;
  const tones = { warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", primary: "bg-primary-soft text-primary" };
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-center gap-4 rounded-3xl border border-border bg-surface p-4 shadow-card transition hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
    >
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl [&_svg]:size-5", hot ? tones[tone] : "bg-surface-2 text-muted-foreground")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-muted-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-lg leading-tight font-extrabold tracking-tight">
          {hot ? formatNumber(count) : empty}
          {hot && detail && <span className="ml-2 text-xs font-semibold text-subtle-foreground">{detail}</span>}
        </span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const now = new Date();
  const ov = await getAdminOverview(now);
  const emailOn = integrations().email;
  const tiers = (["FREE", "PRO", "BUSINESS"] as const).map((t) => ({ tier: t, name: ov.planNames[t] ?? t, count: ov.orgs.byPlan[t] }));
  const maxOrgs = Math.max(1, ...tiers.map((t) => t.count));

  return (
    <AdminPage eyebrow={formatLongDate(now)} title="Visão geral" description="Os números da plataforma em tempo real e as filas que precisam da equipe.">
      <div className="grid gap-3 md:grid-cols-3">
        <QueueCard
          href="/admin/moderacao"
          icon={<ShieldCheck />}
          label="Eventos em análise"
          count={ov.events.pendingReview}
          empty="Fila vazia"
          detail={ov.events.oldestPendingAt ? `mais antigo ${timeAgo(ov.events.oldestPendingAt, now)}` : undefined}
          tone="warning"
        />
        <QueueCard href="/admin/denuncias" icon={<Flag />} label="Denúncias abertas" count={ov.reports.open} empty="Nenhuma aberta" tone="danger" />
        <QueueCard href="/admin/emails?status=FAILED" icon={<Mail />} label="E-mails com falha" count={ov.emails.failed} empty="Nenhuma falha" tone="danger" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Usuários ativos"
          icon={<Users />}
          value={formatNumber(ov.users.active)}
          hint={`${formatNumber(ov.users.loggedIn30d)} entraram nos últimos 30 dias`}
          href="/admin/usuarios?status=ACTIVE"
        />
        <StatCard label="Novos cadastros" icon={<UserPlus />} value={formatNumber(ov.users.new7d)} hint={`nos últimos 7 dias · ${formatNumber(ov.users.new30d)} em 30 dias`} href="/admin/usuarios" />
        <StatCard label="Eventos no ar" icon={<CalendarCheck />} value={formatNumber(ov.events.upcomingPublished)} hint="publicados e ainda por acontecer" />
        <StatCard
          label="MRR estimado"
          icon={<CircleDollarSign />}
          value={formatMoney(ov.mrr.cents)}
          hint={ov.mrr.subscriptions ? `${formatNumber(ov.mrr.subscriptions)} assinatura${ov.mrr.subscriptions > 1 ? "s" : ""} pagante${ov.mrr.subscriptions > 1 ? "s" : ""}` : "Nenhuma assinatura ativa"}
          href="#mrr"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Panel title="Atividade diária" description="Cadastros de pessoas e eventos criados (horário de Brasília)." className="lg:col-span-2">
          <DailyChart series={ov.series} />
        </Panel>
        <Panel title="Organizações por plano" description={`${formatNumber(ov.orgs.total)} no total`} actions={<Link href="/admin/organizacoes" className="text-sm font-semibold text-primary hover:underline">Ver todas</Link>}>
          {ov.orgs.total === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma organização cadastrada ainda.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {tiers.map((t) => (
                <li key={t.tier}>
                  <Link href={`/admin/organizacoes?plano=${t.tier}`} className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-semibold group-hover:text-primary">{t.name}</span>
                      <span className="font-bold tabular-nums">{formatNumber(t.count)}</span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
                      <div className={cn("h-full rounded-full", t.tier === "FREE" ? "bg-border-strong" : "bg-brand-gradient")} style={{ width: `${Math.max(t.count ? 4 : 0, (t.count / maxOrgs) * 100)}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-xs font-semibold text-subtle-foreground">Novas em 30 dias</dt>
              <dd className="mt-0.5 font-bold tabular-nums">{formatNumber(ov.orgs.new30d)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-subtle-foreground">Com selo verificado</dt>
              <dd className="mt-0.5 font-bold tabular-nums">{formatNumber(ov.orgs.verified)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-subtle-foreground">Publicadoras confiáveis</dt>
              <dd className="mt-0.5 font-bold tabular-nums">{formatNumber(ov.orgs.trusted)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-subtle-foreground">Suspensas</dt>
              <dd className="mt-0.5 font-bold tabular-nums">
                {ov.orgs.suspended > 0 ? (
                  <Link href="/admin/organizacoes?status=SUSPENDED" className="text-danger hover:underline">
                    {formatNumber(ov.orgs.suspended)}
                  </Link>
                ) : (
                  0
                )}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Panel title="Receita recorrente (MRR)" className="scroll-mt-24 lg:col-span-2" description="Estimativa pela tabela de preços atual.">
          <div id="mrr" className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="shrink-0 sm:w-48">
              <p className="text-[32px] leading-none font-extrabold tracking-tight tabular-nums">{formatMoney(ov.mrr.cents)}</p>
              <p className="mt-1.5 text-sm text-muted-foreground">por mês</p>
            </div>
            <div className="min-w-0 flex-1">
              {ov.mrr.subscriptions === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma assinatura ativa, em teste ou com pagamento pendente no momento.</p>
              ) : (
                <ul className="divide-y divide-border rounded-2xl border border-border">
                  {(["PRO", "BUSINESS"] as const)
                    .filter((t) => ov.mrr.byTier[t])
                    .map((t) => (
                      <li key={t} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="font-semibold">{ov.planNames[t] ?? t}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatNumber(ov.mrr.byTier[t]!.count)} × · <span className="font-bold text-foreground">{formatMoney(ov.mrr.byTier[t]!.cents)}</span>
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              <p className="mt-3 text-[13px] leading-relaxed text-subtle-foreground">
                Como calculamos: soma do preço do plano de cada assinatura <strong className="font-semibold text-muted-foreground">ativa, em período de teste ou com pagamento pendente</strong> no Stripe. Planos anuais
                entram como preço anual ÷ 12. Não considera cupons, impostos, reembolsos nem planos aplicados manualmente pela equipe.
              </p>
            </div>
          </div>
        </Panel>
        <Panel title="E-mails" description="Últimos 7 dias" actions={<Link href="/admin/emails" className="text-sm font-semibold text-primary hover:underline">Abrir outbox</Link>}>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-semibold text-subtle-foreground">Com falha</dt>
              <dd className={cn("mt-0.5 text-2xl font-extrabold tabular-nums", ov.emails.failed7d > 0 && "text-danger")}>{formatNumber(ov.emails.failed7d)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-subtle-foreground">Não enviados</dt>
              <dd className="mt-0.5 text-2xl font-extrabold tabular-nums">{formatNumber(ov.emails.skipped7d)}</dd>
            </div>
          </dl>
          {!emailOn && (
            <p className="mt-4 rounded-2xl bg-warning-soft px-4 py-3 text-[13px] leading-relaxed text-warning">
              Nenhum provedor de e-mail configurado: as mensagens ficam registradas como “não enviadas”.{" "}
              <Link href="/admin/configuracoes#integracoes" className="font-semibold underline">
                Como ativar
              </Link>
            </p>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}

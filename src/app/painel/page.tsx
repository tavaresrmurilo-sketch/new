import { Bookmark, CalendarPlus, CircleAlert, CircleCheck, Circle, Eye, Hourglass, MailWarning, MousePointerClick, Plus, ShieldAlert, Sparkles, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventRow } from "@/components/painel/event-row";
import { StatTile, UsageMeter } from "@/components/painel/kpi";
import { ResendVerificationButton } from "@/components/painel/resend-verification";
import { PainelPage } from "@/components/painel/shell";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState } from "@/components/ui/misc";
import { zonedParts } from "@/lib/dates";
import { orgOverview } from "@/server/events/organizer-queries";
import { requireCurrentOrg } from "@/server/organizations/current";
import { onboardingChecklist } from "@/server/organizations/service";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = { title: "Visão geral" };

function greeting(now: Date) {
  const h = zonedParts(now, "America/Sao_Paulo").hour;
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function PainelHome({ searchParams }: PageProps<"/painel">) {
  const { user, org } = await requireCurrentOrg();
  const sp = await searchParams;
  const now = new Date();
  const [o, checklist, requireVerified] = await Promise.all([
    orgOverview(org.id, now),
    onboardingChecklist(org.id, user),
    getSetting("publishing.requireVerifiedEmail"),
  ]);
  const firstName = user.name.split(/\s+/)[0];
  const doneCount = checklist.filter((c) => c.done).length;
  const hasPublished = o.counts.publicados + o.counts.encerrados + o.counts.cancelados > 0;
  const quota = { limit: o.usage.plan.boostsPerMonth, used: o.usage.boostsUsed };
  const atLimit = o.usage.plan.maxActiveEvents != null && o.usage.activeEvents >= o.usage.plan.maxActiveEvents;

  return (
    <PainelPage>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">{sp.bemvindo ? "Tudo pronto!" : org.name}</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting(now)}, {firstName}
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            {sp.bemvindo ? "Sua organização foi criada. Siga os primeiros passos abaixo." : "Veja como seus eventos estão indo nos últimos 30 dias."}
          </p>
        </div>
        <Button asChild variant="primary" className="self-start sm:self-auto">
          <Link href="/painel/eventos/novo">
            <Plus /> Novo evento
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-3 empty:hidden">
        {sp.acesso === "restrito" && (
          <Alert tone="warning" icon={<ShieldAlert />} title="Acesso restrito">
            Seu papel na equipe não permite abrir aquela página. Fale com quem administra a organização.
          </Alert>
        )}
        {!user.emailVerified && (
          <Alert
            tone="warning"
            icon={<MailWarning />}
            title="Confirme seu e-mail"
            action={<ResendVerificationButton />}
          >
            {requireVerified
              ? `Para publicar eventos, confirme o endereço ${user.email}. Procure o link na sua caixa de entrada (e no spam).`
              : `Confirme ${user.email} para receber avisos importantes sobre seus eventos.`}
          </Alert>
        )}
        {o.pending.length > 0 && (
          <Alert tone="info" icon={<Hourglass />} title={o.counts.analise === 1 ? "1 evento em análise" : `${o.counts.analise} eventos em análise`}>
            A equipe Mixtour revisa novos eventos para manter o mapa confiável. Avisaremos você assim que {o.counts.analise === 1 ? "ele for aprovado" : "forem aprovados"}.{" "}
            <Link href="/painel/eventos?status=analise" className="font-semibold text-info underline-offset-2 hover:underline">
              Ver eventos
            </Link>
          </Alert>
        )}
        {o.rejected.length > 0 && (
          <Alert tone="danger" icon={<CircleAlert />} title={o.counts.recusados === 1 ? "1 evento precisa de ajustes" : `${o.counts.recusados} eventos precisam de ajustes`}>
            <ul className="mt-1 flex flex-col gap-1.5">
              {o.rejected.slice(0, 3).map((e) => (
                <li key={e.id}>
                  <Link href={`/painel/eventos/${e.id}`} className="font-semibold underline-offset-2 hover:underline">
                    {e.title}
                  </Link>
                  {e.rejectionReason && <span className="text-foreground/70"> — {e.rejectionReason}</span>}
                </li>
              ))}
            </ul>
          </Alert>
        )}
      </div>

      {hasPublished && (
        <section aria-labelledby="kpis" className="mt-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="kpis" className="text-lg font-bold tracking-tight">
              Últimos 30 dias
            </h2>
            <span className="text-xs text-subtle-foreground">Todos os eventos da organização</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Visualizações" value={o.kpis.views} previous={o.previous.views} icon={<Eye />} />
            <StatTile label="Visitantes únicos" value={o.kpis.uniqueViews} previous={o.previous.uniqueViews} icon={<Users />} />
            <StatTile label="Salvamentos" value={o.kpis.saves} previous={o.previous.saves} icon={<Bookmark />} />
            <StatTile label="“Vou”" value={o.kpis.going} previous={o.previous.going} icon={<UserCheck />} />
            <StatTile label="Cliques em ingresso" value={o.kpis.ticketClicks} previous={o.previous.ticketClicks} icon={<MousePointerClick />} className="col-span-2 sm:col-span-1" />
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {!hasPublished && o.upcoming.length === 0 ? (
          <Card className="h-fit overflow-hidden">
            <EmptyState
              icon={<CalendarPlus />}
              title="Publique seu primeiro evento"
              description="Assim que seu evento estiver no mapa, você acompanha aqui quantas pessoas viram, salvaram, marcaram “vou” e clicaram no ingresso."
              action={
                <Button asChild variant="primary">
                  <Link href={o.counts.rascunho ? "/painel/eventos?status=rascunho" : "/painel/eventos/novo"}>
                    <Plus /> {o.counts.rascunho ? "Continuar rascunho" : "Criar evento"}
                  </Link>
                </Button>
              }
            />
          </Card>
        ) : (
        <section aria-labelledby="proximos" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="proximos" className="text-lg font-bold tracking-tight">
              Próximos eventos
            </h2>
            <Link href="/painel/eventos" className="text-sm font-semibold text-primary hover:underline">
              Ver todos
            </Link>
          </div>
          {o.upcoming.length ? (
            <ul className="mt-3 flex flex-col gap-2.5">
              {o.upcoming.map((e) => (
                <EventRow key={e.id} event={e} quota={quota} now={now} />
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-3xl border border-dashed border-border-strong p-6 text-center">
              <p className="font-semibold">Nenhum evento programado</p>
              <p className="mt-1 text-sm text-muted-foreground">Eventos publicados ou em análise que ainda vão acontecer aparecem aqui.</p>
              <Button asChild variant="secondary" size="sm" className="mt-4">
                <Link href="/painel/eventos/novo">
                  <Plus /> Novo evento
                </Link>
              </Button>
            </div>
          )}
        </section>
        )}

        <aside className="flex flex-col gap-4">
          {doneCount < checklist.length && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold tracking-tight">Primeiros passos</h2>
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {doneCount} de {checklist.length}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="bg-brand-gradient h-full rounded-full" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
              </div>
              <ul className="mt-4 flex flex-col gap-1">
                {checklist.map((item) => {
                  const content = (
                    <>
                      {item.done ? <CircleCheck className="size-5 shrink-0 text-success" aria-label="Concluído" /> : <Circle className="size-5 shrink-0 text-border-strong" aria-label="Pendente" />}
                      <span className={item.done ? "text-muted-foreground line-through decoration-1" : "font-semibold"}>{item.label}</span>
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {item.href && !item.done ? (
                        <Link href={item.href} className="-mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm transition hover:bg-surface-2">
                          {content}
                        </Link>
                      ) : (
                        <div className="-mx-2 flex min-h-11 items-center gap-3 px-2 text-sm">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold tracking-tight">Uso do plano</h2>
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{o.usage.plan.name}</span>
            </div>
            <div className="mt-4 flex flex-col gap-4">
              <UsageMeter label="Eventos ativos" used={o.usage.activeEvents} limit={o.usage.plan.maxActiveEvents} />
              {o.usage.plan.boostsPerMonth > 0 ? (
                <UsageMeter label="Destaques no mês" used={o.usage.boostsUsed} limit={o.usage.plan.boostsPerMonth} />
              ) : (
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">Destaques no mapa</span>
                  <span className="text-muted-foreground">Não incluído</span>
                </div>
              )}
            </div>
            {atLimit && <p className="mt-4 text-[13px] text-warning">Você atingiu o limite de eventos ativos. Novos eventos ficam como rascunho até um terminar ou você fazer upgrade.</p>}
            {o.usage.plan.tier !== "BUSINESS" && (
              <Button asChild variant={o.usage.plan.tier === "FREE" || atLimit ? "primary" : "secondary"} size="sm" block className="mt-5">
                <Link href="/painel/plano">
                  <Sparkles /> {o.usage.plan.tier === "FREE" ? "Conhecer o Pro" : "Ver planos"}
                </Link>
              </Button>
            )}
          </Card>

        </aside>
      </div>
    </PainelPage>
  );
}

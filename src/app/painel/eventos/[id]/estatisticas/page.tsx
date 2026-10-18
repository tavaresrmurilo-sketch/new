import { ArrowLeft, Bookmark, Download, ExternalLink, Eye, Lock, MousePointerClick, PencilLine, Share2, Sparkles, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricsChart } from "@/components/painel/charts";
import { whenText } from "@/components/painel/event-row";
import { PainelPage } from "@/components/painel/shell";
import { StatusBadge } from "@/components/painel/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { formatNumber } from "@/lib/format";
import { getPlan } from "@/server/billing/plans";
import { eventStats } from "@/server/events/organizer-queries";
import { requireCurrentOrg } from "@/server/organizations/current";

export const metadata: Metadata = { title: "Estatísticas do evento" };

function Total({ icon, label, value, last }: { icon: React.ReactNode; label: string; value: number; last: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground [&_svg]:size-4">
        {icon}
        <span className="leading-tight">{label}</span>
      </span>
      <span className="text-[26px] leading-none font-extrabold tracking-tight">{formatNumber(value)}</span>
      <span className="text-xs text-subtle-foreground">{formatNumber(last)} em 30 dias</span>
    </div>
  );
}

export default async function EstatisticasPage({ params }: PageProps<"/painel/eventos/[id]/estatisticas">) {
  const { id } = await params;
  const { org } = await requireCurrentOrg();
  const now = new Date();
  const [stats, plan] = await Promise.all([eventStats(org.id, id, now), getPlan(org.plan)]);
  if (!stats) notFound();
  const { event, allTime, last, series } = stats;
  const when = whenText(event, now);
  const isPublic = event.status === "PUBLISHED" || event.status === "CANCELED" || event.status === "ARCHIVED";

  return (
    <PainelPage>
      <Link href="/painel/eventos" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Eventos
      </Link>
      <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.panelStatus} />
            {when && <span className="text-sm text-muted-foreground">{when}</span>}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{event.title}</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Estatísticas desde a publicação, atualizadas em tempo real.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/painel/eventos/${event.id}`}>
              <PencilLine /> Editar
            </Link>
          </Button>
          {isPublic && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/evento/${event.slug}`} target="_blank" rel="noopener">
                <ExternalLink /> Ver página
              </Link>
            </Button>
          )}
          {plan.csvExport ? (
            <Button asChild variant="secondary" size="sm">
              <a href={`/painel/eventos/${event.id}/estatisticas/csv`} download>
                <Download /> Exportar CSV
              </a>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link href="/painel/plano" title="Disponível nos planos Pro e Business">
                <Lock /> Exportar CSV
              </Link>
            </Button>
          )}
        </div>
      </div>

      <section aria-label="Totais" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Total icon={<Eye />} label="Visualizações" value={allTime.views} last={last.views} />
        <Total icon={<Users />} label="Visitantes únicos" value={allTime.uniqueViews} last={last.uniqueViews} />
        <Total icon={<Bookmark />} label="Salvamentos" value={allTime.saves} last={last.saves} />
        <Total icon={<UserCheck />} label="“Vou”" value={allTime.going} last={last.going} />
        <Total icon={<MousePointerClick />} label="Cliques em ingresso" value={allTime.ticketClicks} last={last.ticketClicks} />
        <Total icon={<Share2 />} label="Compartilhamentos" value={allTime.shares} last={last.shares} />
      </section>
      <p className="mt-3 text-xs text-subtle-foreground">
        Agora: {formatNumber(stats.current.saves)} {stats.current.saves === 1 ? "pessoa salvou" : "pessoas salvaram"} e {formatNumber(stats.current.going)} {stats.current.going === 1 ? "marcou" : "marcaram"} “vou”.
        {allTime.views > 0 && ` Taxa de clique no ingresso: ${((allTime.ticketClicks / Math.max(1, allTime.uniqueViews)) * 100).toFixed(1).replace(".", ",")}% dos visitantes únicos.`}
      </p>

      <Card className="relative mt-6 overflow-hidden p-4 sm:p-6">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight">Por dia</h2>
          <span className="text-xs text-subtle-foreground">Últimos 30 dias · horário de Brasília</span>
        </div>
        {plan.fullAnalytics ? (
          <MetricsChart series={series} />
        ) : (
          <>
            <div aria-hidden className="pointer-events-none blur-[6px] select-none">
              <MetricsChart series={series} locked />
            </div>
            <div className="absolute inset-0 grid place-items-center bg-background/40 p-6">
              <div className="max-w-sm rounded-3xl border border-border bg-elevated p-6 text-center shadow-float">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <Sparkles className="size-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold tracking-tight">Veja o desempenho dia a dia</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  No plano {plan.name} você vê os totais. Com o Pro, acompanha cada dia, descobre o que funciona e exporta os dados em CSV.
                </p>
                <Button asChild variant="primary" className="mt-5">
                  <Link href="/painel/plano">
                    <Sparkles /> Conhecer o Pro
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </PainelPage>
  );
}

import { BadgeCheck, CalendarDays, ExternalLink, Flag, ShieldCheck, User } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReportActions, UnpublishButton } from "@/components/admin/actions";
import { EVENT_STATUS, ORG_STATUS, REPORT_STATUS } from "@/components/admin/labels";
import { AdminPage, LinkTabs, Pagination, StatusBadge } from "@/components/admin/ui";
import { REPORT_REASON_LABEL } from "@/components/engagement/report-reasons";
import { Avatar } from "@/components/ui/avatar";
import { Badge, EmptyState } from "@/components/ui/misc";
import { enumParam, pageParam } from "@/server/admin/params";
import { requireAdmin } from "@/server/auth/guards";
import { listReports, type AdminReport, type ReportFilter } from "@/server/moderation/service";
import { formatDateTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Denúncias" };

const FILTERS = ["OPEN", "RESOLVED", "DISMISSED", "all"] as const;

function ReportCard({ r, now }: { r: AdminReport; now: Date }) {
  const ev = r.event;
  const org = r.organization;
  const open = r.status === "OPEN";
  return (
    <article className={cn("rounded-3xl border bg-surface p-4 shadow-card sm:p-5", open ? "border-border" : "border-border opacity-90")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.reason === "FRAUD" || r.reason === "INAPPROPRIATE" ? "danger" : "warning"}>
              <Flag /> {REPORT_REASON_LABEL[r.reason]}
            </Badge>
            <StatusBadge map={REPORT_STATUS} value={r.status} />
            {r.sameTargetOpen > 1 && (
              <Badge tone="danger" className="tabular-nums">
                {r.sameTargetOpen} abertas sobre este {ev ? "evento" : "perfil"}
              </Badge>
            )}
            {r.sameTargetTotal > 1 && r.sameTargetOpen <= 1 && <Badge tone="neutral">{r.sameTargetTotal} denúncias no histórico</Badge>}
          </div>

          {ev ? (
            <div className="mt-3 flex gap-3">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2 text-muted-foreground" style={{ background: ev.coverColor ?? undefined }}>
                {ev.coverThumbUrl ? <img src={ev.coverThumbUrl} alt="" loading="lazy" className="size-full object-cover" /> : <CalendarDays className="size-5" aria-hidden />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base leading-tight font-bold">{ev.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" /> {formatDateTime(ev.startsAt, ev.timezone)}
                  </span>
                  <span>· {ev.city}</span>
                  <StatusBadge map={EVENT_STATUS} value={ev.status} />
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Denúncia sobre o perfil da organização.</p>
          )}

          {org && (
            <Link href={`/admin/organizacoes/${org.id}`} className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-sm font-semibold hover:bg-surface-3">
              <Avatar name={org.name} src={org.logoUrl} size="xs" />
              <span className="truncate">{org.name}</span>
              {org.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verificada" />}
              {org.status !== "ACTIVE" && <StatusBadge map={ORG_STATUS} value={org.status} />}
            </Link>
          )}

          {r.details ? (
            <blockquote className="mt-3 rounded-2xl bg-surface-2/70 px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-line">{r.details}</blockquote>
          ) : (
            <p className="mt-3 text-sm text-subtle-foreground">Sem detalhes adicionais.</p>
          )}

          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="size-3.5" /> {r.reporter ? `${r.reporter.name} (com conta)` : "Visitante sem conta"}
            </span>
            <span>· {timeAgo(r.createdAt, now)}</span>
          </p>

          {!open && r.resolution && (
            <div className="mt-3 flex gap-2 rounded-2xl bg-success-soft/60 px-4 py-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="min-w-0">
                <p className="leading-relaxed break-words">{r.resolution}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.resolvedBy?.name ?? "Equipe"}
                  {r.resolvedAt && ` · ${formatDateTime(r.resolvedAt)}`}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border pt-4 lg:w-56 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          {ev && ev.status !== "PENDING_REVIEW" && ev.status !== "DRAFT" && ev.status !== "REJECTED" && (
            <a
              href={`/evento/${ev.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary hover:underline sm:min-h-9"
            >
              <ExternalLink className="size-4" /> Ver página do evento
            </a>
          )}
          {open ? (
            <ReportActions
              reportId={r.id}
              sameTargetOpen={r.sameTargetOpen}
              canUnpublish={ev?.status === "PUBLISHED"}
              canSuspend={Boolean(org) && org?.status === "ACTIVE"}
              orgName={org?.name ?? null}
            />
          ) : (
            ev?.status === "PUBLISHED" && <UnpublishButton eventId={ev.id} />
          )}
        </div>
      </div>
    </article>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/admin/denuncias">) {
  await requireAdmin();
  const sp = await searchParams;
  const status = (enumParam(sp, "status", FILTERS) ?? "OPEN") as ReportFilter;
  const page = pageParam(sp);
  const data = await listReports(status, page);
  const now = new Date();
  const params = { status: status === "OPEN" ? undefined : status };

  return (
    <AdminPage title="Denúncias" description="Relatos do público sobre eventos. As abertas aparecem primeiro, das mais antigas para as mais recentes.">
      <LinkTabs
        basePath="/admin/denuncias"
        params={params}
        name="status"
        label="Filtrar denúncias por status"
        value={params.status}
        options={[
          { value: undefined, label: "Abertas", count: data.counts.OPEN },
          { value: "RESOLVED", label: "Resolvidas", count: data.counts.RESOLVED },
          { value: "DISMISSED", label: "Descartadas", count: data.counts.DISMISSED },
          { value: "all", label: "Todas" },
        ]}
      />
      {data.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState
            icon={<ShieldCheck />}
            title={status === "OPEN" ? "Nenhuma denúncia aberta" : "Nada por aqui"}
            description={status === "OPEN" ? "Quando alguém denunciar um evento, ele aparece aqui para a equipe analisar." : "Não há denúncias com este status."}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.items.map((r) => (
            <ReportCard key={r.id} r={r} now={now} />
          ))}
        </div>
      )}
      <Pagination basePath="/admin/denuncias" params={params} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} noun="denúncias" />
    </AdminPage>
  );
}

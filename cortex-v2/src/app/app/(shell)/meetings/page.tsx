import Link from "next/link";
import { Plus, Video } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterBar } from "@/components/common/filter-bar";
import { LinkTabs } from "@/components/common/link-tabs";
import { Pagination } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { CreateButton } from "@/components/shell/shell-context";
import { buttonVariants } from "@/components/ui/button";
import { dayKeyInTz } from "@/lib/dates";
import { formatDateTime, formatRelativeDay, formatTime } from "@/lib/format";
import { MEETING_STATUS } from "@/lib/labels";
import { first, parseListParams, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";
import { listMeetings } from "@/server/modules/meetings";

export const metadata = { title: "Reuniões" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("meetings.read");
  const sp = await searchParams;
  const when = first(sp.when) ?? "upcoming";
  const params = parseListParams({ ...sp, when }, { sortable: [], defaultSort: "startsAt" });
  const { rows, total } = await listMeetings(ctx, params);
  const tz = ctx.org.timezone;
  const canWrite = ctx.permissions.has("meetings.write") && ctx.access.level === "FULL";
  const groups = new Map<string, typeof rows>();
  for (const m of rows) {
    const k = dayKeyInTz(m.startsAt, tz);
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Reuniões"
        description="Agenda, atas, decisões e próximas ações. Cole a transcrição para o Córtex AI sugerir resumo e tarefas — você confirma antes de criar."
        actions={canWrite ? <CreateButton kind="meeting" className={buttonVariants({ size: "sm" })}><Plus /> Nova reunião</CreateButton> : null}
      />
      <LinkTabs pathname="/app/meetings" searchParams={sp} active={when} tabs={[{ key: "upcoming", label: "Próximas" }, { key: "past", label: "Anteriores" }]} />
      <FilterBar searchPlaceholder="Buscar reunião" filters={[{ key: "mine", label: "Participação", options: [{ value: "1", label: "Somente as minhas" }] }, { key: "status", label: "Status", options: Object.entries(MEETING_STATUS).map(([v, l]) => ({ value: v, label: l.label })) }]} />
      {rows.length ? (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {formatDateTime(list[0]!.startsAt, tz, { hour: undefined, minute: undefined, weekday: "long" })} · {formatRelativeDay(list[0]!.startsAt, tz)}
              </h2>
              <ul className="divide-y rounded-lg border bg-card">
                {list.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="tabular w-12 text-sm font-medium">{formatTime(m.startsAt, tz)}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/meetings/${m.id}`} className="font-medium hover:underline">{m.title}</Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.client?.name ?? "Interna"} · {m.participants.map((p) => p.user?.name ?? p.contact?.name ?? p.name ?? p.email).filter(Boolean).slice(0, 4).join(", ") || "sem participantes"}
                      </p>
                    </div>
                    {m.aiSummary ? <span className="text-xs text-muted-foreground">resumo confirmado</span> : null}
                    <StatusBadge map={MEETING_STATUS} value={m.status} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={Video} title={when === "upcoming" ? "Nenhuma reunião agendada" : "Nenhuma reunião anterior"} description="Agende reuniões com clientes e equipe para manter o histórico e as decisões em um só lugar." action={canWrite ? <CreateButton kind="meeting" className={buttonVariants({ size: "sm" })}><Plus /> Agendar reunião</CreateButton> : null} />
      )}
      <Pagination pathname="/app/meetings" searchParams={sp} page={params.page} pageSize={params.pageSize} total={total} />
    </div>
  );
}

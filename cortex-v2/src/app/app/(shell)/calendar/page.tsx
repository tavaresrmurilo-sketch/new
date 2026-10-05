import Link from "next/link";
import { MonthCalendar, monthBounds, type CalendarEvent } from "@/components/common/month-calendar";
import { PageHeader } from "@/components/common/page-header";
import { dateOnlyKey, dayKeyInTz, keyToDate, zonedToUtc } from "@/lib/dates";
import { formatTime } from "@/lib/format";
import { buildHref, first, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { can, requireCtx } from "@/server/auth/context";

export const metadata = { title: "Calendário" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireCtx("tasks.read");
  const sp = await searchParams;
  const tz = ctx.org.timezone;
  const todayKey = dayKeyInTz(new Date(), tz);
  const month = /^\d{4}-\d{2}$/.test(first(sp.month) ?? "") ? first(sp.month)! : todayKey.slice(0, 7);
  const scope = first(sp.scope) === "all" ? "all" : "mine";
  const { gridStart, gridEnd } = monthBounds(month);
  const from = keyToDate(gridStart);
  const to = keyToDate(gridEnd);
  const [gs, ge] = [gridStart, gridEnd].map((k) => {
    const [y, m, d] = k.split("-").map(Number) as [number, number, number];
    return zonedToUtc(y, m, d, 0, 0, tz);
  }) as [Date, Date];
  const mine = scope === "mine";
  const [tasks, meetings, contracts, proposals] = await Promise.all([
    ctx.db.task.findMany({ where: { dueDate: { gte: from, lt: to }, status: { not: "CANCELED" }, ...(mine ? { assigneeId: ctx.user.id } : {}) }, select: { id: true, title: true, dueDate: true, status: true }, take: 800 }),
    can(ctx, "meetings.read")
      ? ctx.db.meeting.findMany({ where: { startsAt: { gte: gs, lt: ge }, status: { not: "CANCELED" }, ...(mine ? { participants: { some: { userId: ctx.user.id } } } : {}) }, select: { id: true, title: true, startsAt: true }, take: 500 })
      : Promise.resolve([]),
    can(ctx, "contracts.read")
      ? ctx.db.contract.findMany({ where: { endDate: { gte: from, lt: to }, status: "ACTIVE", ...(mine ? { ownerId: ctx.user.id } : {}) }, select: { id: true, number: true, title: true, endDate: true }, take: 300 })
      : Promise.resolve([]),
    can(ctx, "proposals.read")
      ? ctx.db.proposal.findMany({ where: { validUntil: { gte: from, lt: to }, status: { in: ["SENT", "VIEWED", "NEGOTIATION"] }, ...(mine ? { ownerId: ctx.user.id } : {}) }, select: { id: true, number: true, title: true, validUntil: true }, take: 300 })
      : Promise.resolve([]),
  ]);
  const events: CalendarEvent[] = [
    ...meetings.map((m) => ({ id: m.id, dateKey: dayKeyInTz(m.startsAt, tz), title: m.title, href: `/app/meetings/${m.id}`, tone: "meeting" as const, time: formatTime(m.startsAt, tz) })),
    ...tasks.map((t) => {
      const k = dateOnlyKey(t.dueDate!);
      return { id: t.id, dateKey: k, title: t.title, href: `/app/tasks/${t.id}`, tone: (t.status === "DONE" ? "task-done" : k < todayKey ? "task-overdue" : "task") as CalendarEvent["tone"] };
    }),
    ...contracts.map((c) => ({ id: c.id, dateKey: dateOnlyKey(c.endDate!), title: `Vence: ${c.number}`, href: `/app/contracts/${c.id}`, tone: "contract" as const })),
    ...proposals.map((p) => ({ id: p.id, dateKey: dateOnlyKey(p.validUntil!), title: `Validade: proposta #${p.number}`, href: `/app/proposals/${p.id}`, tone: "proposal" as const })),
  ];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendário"
        description="Reuniões, prazos de tarefas, vencimentos de contratos e validade de propostas em um só lugar."
        actions={
          <div className="inline-flex rounded-md border p-0.5">
            {[
              { v: "mine", label: "Meu calendário" },
              { v: "all", label: "Toda a empresa" },
            ].map((o) => (
              <Link key={o.v} href={buildHref("/app/calendar", sp, { scope: o.v === "mine" ? null : o.v })} className={cn("rounded px-2.5 py-1 text-[13px]", scope === o.v ? "bg-secondary font-medium" : "text-muted-foreground")}>
                {o.label}
              </Link>
            ))}
          </div>
        }
      />
      <MonthCalendar month={month} todayKey={todayKey} events={events} pathname="/app/calendar" searchParams={sp} />
    </div>
  );
}

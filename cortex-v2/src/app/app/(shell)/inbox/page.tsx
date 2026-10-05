import Link from "next/link";
import { ArrowRight, Inbox, PartyPopper, Scale } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Section } from "@/components/common/page-header";
import { InboxList } from "@/features/notifications/components/inbox-list";
import { ProposalFollowUpButton } from "@/features/proposals/components/proposal-actions";
import { formatRelativeTime } from "@/lib/format";
import { can, requireCtx } from "@/server/auth/context";
import { getMorningBrief } from "@/server/modules/intelligence";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const ctx = await requireCtx();
  const [notifications, brief, pendingDecisions] = await Promise.all([
    ctx.db.notification.findMany({
      where: { userId: ctx.user.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
    getMorningBrief(ctx),
    can(ctx, "decisions.resolve")
      ? ctx.db.decision.count({ where: { status: "PENDING", ...(["OWNER", "ADMIN", "MANAGER"].includes(ctx.member?.roleKey ?? "") ? {} : { OR: [{ assigneeId: ctx.user.id }, { assigneeId: null, createdById: ctx.user.id }] }) } })
      : 0,
  ]);
  const followups = brief.sections.find((s) => s.key === "followups");
  const tasks = brief.sections.find((s) => s.key === "tasks");
  const canFollowUp = can(ctx, "proposals.write") && ctx.access.level === "FULL";
  const zero = !notifications.length && !followups && !tasks && !pendingDecisions;
  return (
    <div className="space-y-6">
      <PageHeader title="Inbox" description="Tudo o que precisa de você em um só lugar: notificações, decisões, follow-ups e tarefas do dia. Arquive o que já foi tratado." />
      {zero ? (
        <EmptyState icon={PartyPopper} title="Inbox zero" description="Nenhuma notificação, decisão, follow-up ou tarefa pendente para você agora." action={<Link href="/app/dashboard" className="text-sm text-primary hover:underline">Voltar ao dashboard</Link>} />
      ) : null}

      {pendingDecisions ? (
        <Link href="/app/decisions" className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent">
          <span className="flex size-8 items-center justify-center rounded-md bg-warning/10 text-warning"><Scale className="size-4" /></span>
          <span className="flex-1 text-sm">
            <span className="font-medium">{pendingDecisions} decisão(ões) aguardando você</span>
            <span className="block text-xs text-muted-foreground">Aprovações, duplicidades e riscos críticos</span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" />
        </Link>
      ) : null}

      {followups ? (
        <Section title={`Follow-ups pendentes (${followups.total})`} description="Calculados a partir das propostas enviadas e dos próximos passos das oportunidades. Somem quando o follow-up é registrado. Nenhuma mensagem é enviada automaticamente.">
          <ul className="divide-y rounded-lg border bg-card">
            {followups.items.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={it.href} className="text-sm font-medium hover:underline">{it.title}</Link>
                  {it.detail ? <p className="text-xs text-muted-foreground">{it.detail}</p> : null}
                </div>
                {canFollowUp && it.href.startsWith("/app/proposals/") ? <ProposalFollowUpButton id={it.id} /> : <Link href={it.href} className="text-xs text-primary hover:underline">Abrir</Link>}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {tasks ? (
        <Section title={`Suas tarefas de hoje e atrasadas (${tasks.total})`} actions={<Link href="/app/tasks?assignee=me" className="text-xs text-primary hover:underline">Ver tarefas</Link>}>
          <ul className="divide-y rounded-lg border bg-card">
            {tasks.items.map((it) => (
              <li key={it.id} className="px-4 py-2.5">
                <Link href={it.href} className="text-sm font-medium hover:underline">{it.title}</Link>
                {it.detail ? <p className="text-xs text-muted-foreground">{it.detail}</p> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Notificações">
        {notifications.length ? (
          <InboxList items={notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: !!n.readAt, when: formatRelativeTime(n.createdAt) }))} />
        ) : (
          <EmptyState compact icon={Inbox} title="Nenhuma notificação" description="Menções, atribuições, alertas de contratos e aprovações aparecem aqui." />
        )}
      </Section>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Lightbulb } from "lucide-react";
import { ActivityTimeline } from "@/components/common/activity-timeline";
import { DetailList, PageHeader, Section } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { TagList } from "@/components/common/tag-list";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Card, CardContent } from "@/components/ui/card";
import { InteractionComposer } from "@/features/clients/components/interaction-form";
import { LeadActions } from "@/features/leads/components/lead-actions";
import { DAY_MS, daysSince } from "@/lib/dates";
import { formatCurrency, formatDateTime, formatPhone, formatRelativeTime } from "@/lib/format";
import { LEAD_STATUS, SOURCE_LABELS } from "@/lib/labels";
import { toNumber } from "@/lib/utils";
import { requireCtx } from "@/server/auth/context";
import { nextBestActionForLead } from "@/server/intelligence/next-best-action";
import { tagsFor } from "@/server/modules/tags";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("leads.read");
  const { id } = await params;
  const lead = await ctx.db.lead.findUnique({ where: { id }, include: { owner: { select: { name: true } } } });
  if (!lead) notFound();
  const [activities, tags] = await Promise.all([
    ctx.db.activity.findMany({ where: { leadId: id }, include: { actor: { select: { name: true } } }, orderBy: { occurredAt: "desc" }, take: 50 }),
    tagsFor(ctx.db, "lead", [id]),
  ]);
  const now = new Date();
  const recs = nextBestActionForLead({ status: lead.status, daysSinceCreated: Math.floor((now.getTime() - lead.createdAt.getTime()) / DAY_MS), daysSinceContact: daysSince(lead.lastContactAt, now) });
  const writable = ctx.access.level === "FULL";
  return (
    <div className="space-y-6">
      <BreadcrumbLabel segment={id} label={lead.name} />
      <PageHeader
        eyebrow={<StatusBadge map={LEAD_STATUS} value={lead.status} />}
        title={lead.name}
        description={[lead.jobTitle, lead.companyName].filter(Boolean).join(" · ") || undefined}
        actions={
          <LeadActions
            lead={{ id: lead.id, name: lead.name, companyName: lead.companyName, potentialValue: lead.potentialValue ? toNumber(lead.potentialValue) : null, status: lead.status }}
            values={{
              name: lead.name,
              companyName: lead.companyName,
              email: lead.email,
              phone: lead.phone,
              whatsapp: lead.whatsapp,
              jobTitle: lead.jobTitle,
              source: lead.source,
              status: lead.status === "CONVERTED" ? "QUALIFIED" : lead.status,
              ownerId: lead.ownerId,
              notes: lead.notes,
              potentialValue: lead.potentialValue ? toNumber(lead.potentialValue) : null,
              tags: (tags.get(id) ?? []).map((t) => t.name),
            }}
            canWrite={writable && ctx.permissions.has("leads.write")}
            canDelete={writable && ctx.permissions.has("leads.delete")}
            canConvert={writable && ctx.permissions.has("clients.write") && ctx.permissions.has("opportunities.write")}
          />
        }
      />
      {lead.status === "CONVERTED" ? (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex flex-wrap items-center gap-3 pt-4 text-sm">
            Lead convertido {lead.convertedAt ? formatRelativeTime(lead.convertedAt) : ""}.
            {lead.convertedClientId ? (
              <Link className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={`/app/clients/${lead.convertedClientId}`}>
                Ver cliente <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
            {lead.convertedOpportunityId ? (
              <Link className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={`/app/opportunities/${lead.convertedOpportunityId}`}>
                Ver oportunidade <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {writable && ctx.permissions.has("leads.write") && lead.status !== "CONVERTED" ? <InteractionComposer target={{ leadId: lead.id }} /> : null}
          <Section title="Timeline">
            <ActivityTimeline tz={ctx.org.timezone} items={activities.map((a) => ({ ...a, actorName: a.actor?.name }))} />
          </Section>
        </div>
        <div className="space-y-4">
          {recs.length ? (
            <Card>
              <CardContent className="space-y-2 pt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Lightbulb className="size-3.5" /> Próxima melhor ação
                </p>
                {recs.map((r) => (
                  <div key={r.kind}>
                    <p className="text-sm font-medium">{r.action}</p>
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardContent className="pt-4">
              <DetailList
                className="sm:grid-cols-1"
                items={[
                  { label: "E-mail", value: lead.email ? <a className="hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : "—" },
                  { label: "Telefone", value: formatPhone(lead.phone) },
                  { label: "WhatsApp", value: lead.whatsapp ? <a className="hover:underline" href={`https://wa.me/${lead.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{formatPhone(lead.whatsapp)}</a> : "—" },
                  { label: "Origem", value: SOURCE_LABELS[lead.source] },
                  { label: "Valor potencial", value: lead.potentialValue ? formatCurrency(lead.potentialValue, ctx.org.currency) : "—" },
                  { label: "Responsável", value: lead.owner?.name ?? "—" },
                  { label: "Último contato", value: lead.lastContactAt ? formatDateTime(lead.lastContactAt, ctx.org.timezone) : "Nenhum" },
                  { label: "Criado em", value: formatDateTime(lead.createdAt, ctx.org.timezone) },
                  { label: "Tags", value: <TagList tags={tags.get(id) ?? []} max={10} /> },
                ]}
              />
              {lead.notes ? <p className="mt-4 whitespace-pre-line border-t pt-3 text-sm text-muted-foreground">{lead.notes}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

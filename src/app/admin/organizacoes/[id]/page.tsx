import { ArrowLeft, BadgeCheck, ExternalLink, Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangePlanButton, OrgFlagSwitch, OrgStatusActions, UnpublishButton } from "@/components/admin/actions";
import { EVENT_STATUS, ORG_ROLE, ORG_STATUS, PLAN_LABEL, SUBSCRIPTION_STATUS, USER_STATUS } from "@/components/admin/labels";
import { AdminPage, Meta, Panel, StatusBadge } from "@/components/admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/misc";
import { getOrganizationDetail } from "@/server/admin/organizations";
import { requireAdmin } from "@/server/auth/guards";
import { isEntitled } from "@/server/billing/sync";
import { formatDateTime, formatNumber, formatShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Organização" };

const STATUS_ORDER = ["PUBLISHED", "PENDING_REVIEW", "DRAFT", "REJECTED", "CANCELED", "ARCHIVED"] as const;

function safeHttp(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export default async function OrganizationDetailPage({ params }: PageProps<"/admin/organizacoes/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getOrganizationDetail(id);
  if (!detail) notFound();
  const { org, events, eventsByStatus, openReports } = detail;
  const sub = org.subscription;
  const website = safeHttp(org.website);

  return (
    <AdminPage
      eyebrow={
        <Link href="/admin/organizacoes" className="inline-flex min-h-8 items-center gap-1 hover:underline">
          <ArrowLeft className="size-4" /> Organizações
        </Link>
      }
      title={
        <span className="flex items-center gap-3">
          <Avatar name={org.name} src={org.logoUrl} size="md" square />
          <span className="line-clamp-2 min-w-0 break-words">{org.name}</span>
          {org.verified && <BadgeCheck className="size-6 shrink-0 text-primary" aria-label="Verificada" />}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge map={ORG_STATUS} value={org.status} />
          <Badge tone={org.plan === "FREE" ? "neutral" : "brand"}>{PLAN_LABEL[org.plan]}</Badge>
          <span>
            /{org.slug} · desde {formatShortDate(org.createdAt)}
          </span>
        </span>
      }
      actions={
        <>
          {org.status === "ACTIVE" && (
            <a href={`/organizador/${org.slug}`} target="_blank" rel="noopener" className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-primary hover:bg-primary-soft">
              <ExternalLink className="size-4" /> Página pública
            </a>
          )}
          <OrgStatusActions orgId={org.id} name={org.name} status={org.status} />
        </>
      }
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Selos e moderação">
          <div className="flex flex-col gap-5">
            <OrgFlagSwitch orgId={org.id} flag="verified" value={org.verified} label="Selo verificado" description="Mostra o selo azul no perfil e nos eventos. Conceda depois de confirmar a identidade do organizador." />
            <OrgFlagSwitch
              orgId={org.id}
              flag="trusted"
              value={org.trustedPublisher}
              label="Publicadora confiável"
              description="No modo “apenas organizações novas”, os eventos são publicados sem análise prévia."
            />
          </div>
          {openReports > 0 && (
            <Link href="/admin/denuncias" className="mt-5 flex min-h-11 items-center gap-2 rounded-2xl bg-danger-soft px-4 text-sm font-semibold text-danger">
              <Flag className="size-4" /> {openReports} denúncia{openReports > 1 ? "s" : ""} aberta{openReports > 1 ? "s" : ""}
            </Link>
          )}
        </Panel>

        <Panel title="Plano e assinatura" actions={<ChangePlanButton orgId={org.id} current={org.plan} activeSubscription={Boolean(sub && isEntitled(sub.status))} />}>
          <dl className="grid grid-cols-2 gap-4">
            <Meta label="Plano atual">{PLAN_LABEL[org.plan]}</Meta>
            <Meta label="Cliente Stripe">{org.stripeCustomerId ? "Vinculado" : "—"}</Meta>
            {sub ? (
              <>
                <Meta label="Assinatura">
                  <StatusBadge map={SUBSCRIPTION_STATUS} value={sub.status} />
                </Meta>
                <Meta label="Cobrança">
                  {PLAN_LABEL[sub.tier]} · {sub.interval === "year" ? "anual" : "mensal"}
                </Meta>
                <Meta label={sub.cancelAtPeriodEnd ? "Termina em" : "Renova em"}>{sub.currentPeriodEnd ? formatShortDate(sub.currentPeriodEnd) : "—"}</Meta>
                <Meta label="ID no Stripe">
                  <span className="font-mono text-xs">{sub.stripeSubscriptionId}</span>
                </Meta>
              </>
            ) : (
              <p className="col-span-2 text-sm text-muted-foreground">Sem assinatura no Stripe{org.plan !== "FREE" ? " — plano aplicado manualmente pela equipe." : "."}</p>
            )}
          </dl>
        </Panel>

        <Panel title="Contato e perfil">
          <dl className="grid grid-cols-2 gap-4">
            <Meta label="E-mail de contato">{org.contactEmail ?? "—"}</Meta>
            <Meta label="Cidade">{org.city ? `${org.city}${org.state ? `/${org.state}` : ""}` : "—"}</Meta>
            <Meta label="Site">
              {website ? (
                <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="text-primary hover:underline">
                  {new URL(website).hostname.replace(/^www\./, "")}
                </a>
              ) : (
                "—"
              )}
            </Meta>
            <Meta label="Instagram">{org.instagram ? `@${org.instagram.replace(/^@/, "")}` : "—"}</Meta>
            <Meta label="Seguidores">{formatNumber(org._count.followers)}</Meta>
            <Meta label="Locais salvos">{formatNumber(org._count.venues)}</Meta>
          </dl>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <Panel title="Equipe" description={`${org.members.length} pessoa${org.members.length === 1 ? "" : "s"}`} className="lg:col-span-2">
          <ul className="divide-y divide-border">
            {org.members.map((m) => (
              <li key={m.user.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={m.user.name} src={m.user.avatarUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/usuarios/${m.user.id}`} className="block truncate text-sm font-semibold hover:underline">
                    {m.user.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">{ORG_ROLE[m.role]}</span>
                  {m.user.status !== "ACTIVE" && <StatusBadge map={USER_STATUS} value={m.user.status} />}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Eventos" description={`${formatNumber(org._count.events)} no total`} className="lg:col-span-3">
          <div className="mb-4 flex flex-wrap gap-1.5">
            {STATUS_ORDER.filter((s) => eventsByStatus[s]).map((s) => (
              <Badge key={s} tone={EVENT_STATUS[s].tone}>
                {EVENT_STATUS[s].label}: {eventsByStatus[s]}
              </Badge>
            ))}
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento criado ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(e.startsAt, e.timezone)} · {formatNumber(e.viewsCount)} visualizações · {formatNumber(e.goingCount)} vão
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge map={EVENT_STATUS} value={e.status} />
                    {e.status === "PUBLISHED" && <UnpublishButton eventId={e.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  );
}

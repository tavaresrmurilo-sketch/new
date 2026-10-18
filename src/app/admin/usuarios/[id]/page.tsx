import { ArrowLeft, BadgeCheck, Building2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserStatusActions } from "@/components/admin/actions";
import { ORG_ROLE, ORG_STATUS, PLAN_LABEL, USER_STATUS } from "@/components/admin/labels";
import { AdminPage, Meta, Panel, StatusBadge } from "@/components/admin/ui";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/misc";
import { getUserDetail } from "@/server/admin/users";
import { requireAdmin } from "@/server/auth/guards";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Conta" };

export default async function UserDetailPage({ params }: PageProps<"/admin/usuarios/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const { user: u, lastActivityAt } = detail;
  const now = new Date();
  const locked = u.id === admin.id ? "Esta é a sua conta." : u.role === "ADMIN" ? "Contas da equipe Mixtour são gerenciadas pelo ambiente (seed), não pelo painel." : null;

  return (
    <AdminPage
      eyebrow={
        <Link href="/admin/usuarios" className="inline-flex min-h-8 items-center gap-1 hover:underline">
          <ArrowLeft className="size-4" /> Usuários
        </Link>
      }
      title={
        <span className="flex items-center gap-3">
          <Avatar name={u.name} src={u.avatarUrl} size="md" />
          <span className="line-clamp-2 min-w-0 break-words">{u.name}</span>
        </span>
      }
      description={u.email}
      actions={<UserStatusActions userId={u.id} name={u.name} status={u.status} locked={locked} />}
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Conta" className="lg:col-span-2">
          <div className="mb-5 flex flex-wrap gap-1.5">
            <StatusBadge map={USER_STATUS} value={u.status} />
            {u.role === "ADMIN" && (
              <Badge tone="brand">
                <ShieldCheck /> Equipe Mixtour
              </Badge>
            )}
            {u.emailVerifiedAt ? <Badge tone="info">E-mail verificado</Badge> : <Badge tone="warning">E-mail não verificado</Badge>}
            {u.oauthAccounts.map((o) => (
              <Badge key={o.provider} tone="outline">
                Entra com {o.provider === "google" ? "Google" : o.provider}
              </Badge>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <Meta label="Criada em">{formatDateTime(u.createdAt)}</Meta>
            <Meta label="Último login">{u.lastLoginAt ? `${formatDateTime(u.lastLoginAt)}` : "Nunca entrou"}</Meta>
            <Meta label="Última atividade">{lastActivityAt ? timeAgo(lastActivityAt, now) : "—"}</Meta>
            <Meta label="Sessões abertas">{formatNumber(u._count.sessions)}</Meta>
            <Meta label="E-mail verificado em">{u.emailVerifiedAt ? formatDateTime(u.emailVerifiedAt) : "—"}</Meta>
            <Meta label="Cidade">{u.homeCity ?? "—"}</Meta>
            <Meta label="Termos aceitos">{u.termsAcceptedAt ? formatDateTime(u.termsAcceptedAt) : "—"}</Meta>
            <Meta label="Notificações">{[u.notifyEmail && "e-mail", u.notifyPush && "push"].filter(Boolean).join(" e ") || "desligadas"}</Meta>
            <Meta label="Novidades por e-mail">{u.marketingOptIn ? "Aceita" : "Não"}</Meta>
            {u.deletedAt && <Meta label="Excluída em">{formatDateTime(u.deletedAt)}</Meta>}
          </dl>
        </Panel>
        <Panel title="Atividade">
          <dl className="grid grid-cols-2 gap-4">
            <Meta label="Eventos salvos">{formatNumber(u._count.saves)}</Meta>
            <Meta label="Presenças marcadas">{formatNumber(u._count.rsvps)}</Meta>
            <Meta label="Organizações seguidas">{formatNumber(u._count.follows)}</Meta>
            <Meta label="Eventos criados">{formatNumber(u._count.createdEvents)}</Meta>
            <Meta label="Denúncias feitas">{formatNumber(u._count.reports)}</Meta>
          </dl>
          <Link href={`/admin/auditoria?alvo=${u.id}`} className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
            Ver histórico na auditoria
          </Link>
        </Panel>
      </div>

      <Panel title="Organizações" description="Equipes das quais a pessoa participa." className="mt-3">
        {u.memberships.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" /> Não participa de nenhuma organização.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {u.memberships.map((m) => (
              <li key={m.organization.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={m.organization.name} src={m.organization.logoUrl} size="sm" square />
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/organizacoes/${m.organization.id}`} className="flex items-center gap-1 font-semibold hover:underline">
                    <span className="truncate">{m.organization.name}</span>
                    {m.organization.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verificada" />}
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    {ORG_ROLE[m.role]} · desde {formatDateTime(m.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <Badge tone={m.organization.plan === "FREE" ? "neutral" : "brand"}>{PLAN_LABEL[m.organization.plan]}</Badge>
                  {m.organization.status !== "ACTIVE" && <StatusBadge map={ORG_STATUS} value={m.organization.status} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AdminPage>
  );
}

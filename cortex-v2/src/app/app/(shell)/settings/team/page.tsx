import { UserAvatar } from "@/components/common/user-avatar";
import { EditMemberButton, InviteButton, RevokeInviteButton } from "@/features/team/components/team-admin";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/context";
import { checkLimit } from "@/server/billing/feature-gate";

export const metadata = { title: "Equipe" };

export default async function TeamSettingsPage() {
  const ctx = await requireCtx("users.manage");
  const [members, invites, roles, limit] = await Promise.all([
    ctx.db.organizationMember.findMany({ orderBy: [{ status: "asc" }, { user: { name: "asc" } }], include: { user: { select: { name: true, email: true, avatarUrl: true, lastLoginAt: true } }, role: { select: { id: true, name: true, key: true } } } }),
    ctx.db.invitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, include: { role: { select: { name: true } } } }),
    ctx.db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, key: true, name: true, isSystem: true } }),
    checkLimit(ctx, "users", 0),
  ]);
  const writable = ctx.access.level === "FULL";
  const assignable = roles.filter((r) => r.key !== "OWNER" || ctx.member?.roleKey === "OWNER");
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">{members.filter((m) => m.status === "ACTIVE").length} membro(s) ativo(s){limit.max !== null ? ` de ${limit.max} permitidos no plano` : ""}.</p>
        {writable ? <InviteButton roles={assignable} /> : null}
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <UserAvatar name={m.user.name} src={m.user.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.user.name} {m.status !== "ACTIVE" ? <span className="text-xs font-normal text-destructive">(desativado)</span> : null}</p>
              <p className="truncate text-xs text-muted-foreground">{m.user.email} · {m.role.name}{m.title ? ` · ${m.title}` : ""}{m.department ? ` · ${m.department}` : ""} · {m.weeklyCapacityHours} h/sem{m.user.lastLoginAt ? ` · último acesso ${formatRelativeTime(m.user.lastLoginAt)}` : ""}</p>
            </div>
            {writable && (m.role.key !== "OWNER" || ctx.member?.roleKey === "OWNER") ? (
              <EditMemberButton member={{ id: m.id, roleId: m.roleId, title: m.title, department: m.department, weeklyCapacityHours: m.weeklyCapacityHours, status: m.status, name: m.user.name }} roles={assignable} departments={ctx.org.settings.departments} isSelf={m.userId === ctx.user.id} />
            ) : null}
          </li>
        ))}
      </ul>
      {invites.length ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold">Convites pendentes</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1">{i.email} <span className="text-xs text-muted-foreground">· {i.role.name} · expira {formatDateTime(i.expiresAt, ctx.org.timezone)}</span></span>
                {writable ? <RevokeInviteButton id={i.id} /> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

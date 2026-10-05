import { PasswordForm, SessionRevokeButton } from "@/features/settings/components/settings-forms";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/context";

export const metadata = { title: "Segurança" };

export default async function SecurityPage() {
  const ctx = await requireCtx();
  const sessions = await prisma.session.findMany({ where: { userId: ctx.user.id, expiresAt: { gt: new Date() } }, orderBy: { lastActivityAt: "desc" }, select: { id: true, ip: true, userAgent: true, createdAt: true, lastActivityAt: true } });
  return (
    <>
      <PasswordForm />
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 p-5 pb-3">
          <div>
            <h2 className="text-sm font-semibold">Sessões ativas</h2>
            <p className="text-[13px] text-muted-foreground">Dispositivos conectados à sua conta. Encerre os que você não reconhece.</p>
          </div>
          {sessions.length > 1 ? <SessionRevokeButton all /> : null}
        </div>
        <ul className="divide-y border-t">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{s.userAgent ?? "Dispositivo desconhecido"}</p>
                <p className="text-xs text-muted-foreground">IP {s.ip ?? "—"} · iniciada {formatDateTime(s.createdAt, ctx.org.timezone)} · última atividade {formatDateTime(s.lastActivityAt, ctx.org.timezone)}</p>
              </div>
              {s.id === ctx.sessionId ? <span className="text-xs font-medium text-success">Esta sessão</span> : <SessionRevokeButton id={s.id} />}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border bg-card p-5 text-[13px] text-muted-foreground">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Proteções da conta</h2>
        Senhas armazenadas com hash scrypt; sessões com cookie HttpOnly, Secure e SameSite; expiração por inatividade; limite de tentativas de login; todas as ações sensíveis registradas no log de auditoria. Autenticação em dois fatores: integração futura.
      </div>
    </>
  );
}

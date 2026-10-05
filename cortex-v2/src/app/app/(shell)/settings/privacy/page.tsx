import { DeletionPanel } from "@/features/settings/components/settings-forms";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { can, requireCtx } from "@/server/auth/context";

export const metadata = { title: "Privacidade (LGPD)" };

export default async function PrivacyPage() {
  const ctx = await requireCtx();
  const [consents, org] = await Promise.all([
    prisma.consentRecord.findMany({ where: { userId: ctx.user.id }, orderBy: { acceptedAt: "desc" } }),
    prisma.organization.findUnique({ where: { id: ctx.org.id }, select: { deletionRequestedAt: true, deletionScheduledFor: true } }),
  ]);
  return (
    <>
      <div className="rounded-lg border bg-card p-5 text-[13px]">
        <h2 className="text-sm font-semibold">Seus dados pessoais</h2>
        <p className="mt-1 text-muted-foreground">Baixe uma cópia dos seus dados de usuário (perfil, vínculos, consentimentos e sessões) em JSON.</p>
        <a href="/api/privacy/export?scope=me" className="mt-3 inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-accent">Exportar meus dados</a>
      </div>
      {can(ctx, "data.export") ? (
        <div className="rounded-lg border bg-card p-5 text-[13px]">
          <h2 className="text-sm font-semibold">Dados da empresa</h2>
          <p className="mt-1 text-muted-foreground">Exporta todos os registros do workspace (clientes, leads, oportunidades, projetos, tarefas, propostas, contratos, recebimentos, atividades…) em JSON. A exportação é registrada na auditoria.</p>
          <a href="/api/privacy/export?scope=org" className="mt-3 inline-flex h-8 items-center rounded-md border px-3 text-sm hover:bg-accent">Exportar dados da empresa</a>
        </div>
      ) : null}
      <div className="rounded-lg border bg-card p-5 text-[13px]">
        <h2 className="text-sm font-semibold">Consentimentos</h2>
        {consents.length ? (
          <ul className="mt-2 space-y-1 text-muted-foreground">{consents.map((c) => <li key={c.id}>{c.type} · versão {c.version} · aceito em {formatDateTime(c.acceptedAt, ctx.org.timezone)}{c.revokedAt ? ` · revogado em ${formatDateTime(c.revokedAt, ctx.org.timezone)}` : ""}</li>)}</ul>
        ) : <p className="mt-1 text-muted-foreground">Nenhum consentimento registrado.</p>}
        <p className="mt-2 text-muted-foreground">Consulte a <a href="/privacy" className="text-primary hover:underline">Política de Privacidade</a> e os <a href="/terms" className="text-primary hover:underline">Termos de Uso</a>.</p>
      </div>
      {can(ctx, "organization.delete") ? <DeletionPanel orgName={ctx.org.name} requestedAt={org?.deletionRequestedAt?.toISOString() ?? null} scheduledFor={org?.deletionScheduledFor?.toISOString() ?? null} /> : null}
    </>
  );
}

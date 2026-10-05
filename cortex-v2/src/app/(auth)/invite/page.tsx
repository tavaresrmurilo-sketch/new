import Link from "next/link";
import { AcceptInviteForm } from "@/features/auth/components/auth-forms";
import { prisma } from "@/lib/db";
import { getSession } from "@/server/auth/session";
import { hashToken } from "@/server/security/crypto";

export const metadata = { title: "Convite" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const invite = token
    ? await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { organization: { select: { name: true } }, role: { select: { name: true } } } })
    : null;
  const valid = invite && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();
  if (!valid || !token) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Convite indisponível</h1>
        <p className="text-sm text-muted-foreground">Este convite é inválido, já foi usado ou expirou. Peça um novo convite ao administrador do workspace.</p>
        <Link href="/login" className="text-sm text-primary hover:underline">
          Ir para o login
        </Link>
      </div>
    );
  }
  const [session, existing] = await Promise.all([getSession(), prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })]);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Convite para {invite.organization.name}</h1>
        <p className="text-sm text-muted-foreground">Papel: {invite.role.name}</p>
      </div>
      {session && session.user.email !== invite.email ? (
        <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          Você está conectado como {session.user.email}, mas o convite foi enviado para {invite.email}. Saia da conta atual para aceitá-lo.
        </p>
      ) : (
        <AcceptInviteForm token={token} email={invite.email} orgName={invite.organization.name} needsAccount={!existing} loggedIn={Boolean(session)} />
      )}
    </div>
  );
}

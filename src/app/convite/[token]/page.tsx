import { BadgeCheck, CalendarClock, Link2Off, LogIn, ShieldCheck, TriangleAlert, UserPlus, UserRoundPen, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeIconButton } from "@/components/layout/theme-toggle";
import { formatFullDate } from "@/components/pricing/pricing";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { switchAccountForInviteAction } from "@/server/team/actions";
import { findInviteByToken, maskEmail, normalizeEmail, ROLE_LABEL } from "@/server/team/service";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Convite para equipe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token: raw } = await params;
  const token = safeDecode(raw);
  const [found, user] = await Promise.all([findInviteByToken(token), getSessionUser()]);
  const back = `/convite/${encodeURIComponent(token)}`;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-[#7c5cff] opacity-[0.14] blur-[140px]" />
      <div aria-hidden className="pointer-events-none absolute -right-40 -bottom-56 size-[520px] rounded-full bg-[#ff4d8d] opacity-[0.10] blur-[140px]" />
      <header className="safe-top relative">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Mixtour — início">
            <Logo />
          </Link>
          <ThemeIconButton />
        </div>
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pt-4 pb-16">
        <div className="rounded-[28px] border border-border bg-surface p-6 shadow-float sm:p-8">
          <InviteBody found={found} user={user} token={token} back={back} />
        </div>
        <p className="mt-6 text-center text-xs text-subtle-foreground">
          Convites da equipe valem por 7 dias e só funcionam com a conta do e-mail convidado.
        </p>
      </main>
    </div>
  );
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

type Found = Awaited<ReturnType<typeof findInviteByToken>>;
type User = Awaited<ReturnType<typeof getSessionUser>>;

function Problem({ icon, title, children, cta }: { icon: React.ReactNode; title: string; children: React.ReactNode; cta?: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-surface-2 text-muted-foreground [&_svg]:size-7">{icon}</div>
      <h1 className="mt-5 text-xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      <div className="mt-6">
        {cta ?? (
          <Button asChild variant="secondary" block>
            <Link href="/">Ir para o Mixtour</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

async function InviteBody({ found, user, token, back }: { found: Found; user: User; token: string; back: string }) {
  if (!found) {
    return (
      <Problem icon={<Link2Off />} title="Convite não encontrado">
        O link pode estar incompleto ou ter sido trocado por um mais novo. Peça para quem convidou você reenviar o convite.
      </Problem>
    );
  }

  const { invite, state } = found;
  const org = invite.organization;
  const inviter = invite.invitedBy?.name ?? "A equipe";

  if (state === "accepted" || state === "revoked" || state === "expired" || org.status === "SUSPENDED") {
    const member = user
      ? await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } }, select: { id: true } })
      : null;
    if (member) {
      return (
        <Problem
          icon={<BadgeCheck />}
          title="Você já faz parte da equipe"
          cta={
            <Button asChild variant="primary" block>
              <Link href="/painel">Ir para o painel</Link>
            </Button>
          }
        >
          Sua conta já participa de {org.name}. É só abrir o painel para trabalhar nos eventos.
        </Problem>
      );
    }
    if (org.status === "SUSPENDED") {
      return (
        <Problem icon={<TriangleAlert />} title="Organização indisponível">
          {org.name} está suspensa no momento, então novos membros não podem entrar.
        </Problem>
      );
    }
    if (state === "accepted") {
      return (
        <Problem icon={<Link2Off />} title="Este convite já foi usado">
          Cada convite funciona uma vez. Se precisar de acesso a {org.name}, peça um novo convite.
        </Problem>
      );
    }
    if (state === "revoked") {
      return (
        <Problem icon={<Link2Off />} title="Este convite foi cancelado">
          {org.name} cancelou este convite. Se foi engano, peça para {inviter === "A equipe" ? "a equipe" : inviter} enviar outro.
        </Problem>
      );
    }
    return (
      <Problem icon={<CalendarClock />} title="Este convite expirou">
        O convite venceu em {formatFullDate(invite.expiresAt)}. Peça para {inviter === "A equipe" ? "a equipe" : inviter} reenviar — o novo link chega no mesmo e-mail.
      </Problem>
    );
  }

  const roleText =
    invite.role === "ADMIN"
      ? "Como administrador(a), você poderá publicar e editar eventos e cuidar dos locais, da equipe e do plano."
      : "Como editor(a), você poderá criar, publicar e editar os eventos da organização.";
  const sameEmail = user ? normalizeEmail(user.email) === normalizeEmail(invite.email) : false;

  return (
    <div>
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <Avatar name={org.name} src={org.logoUrl} size="lg" square className="shadow-card" />
          <span className="absolute -right-2 -bottom-2 grid size-8 place-items-center rounded-full border-4 border-surface bg-primary text-primary-foreground">
            <Users className="size-3.5" aria-hidden />
          </span>
        </div>
        <p className="mt-5 text-sm font-semibold text-primary">Convite para a equipe</p>
        <h1 className="mt-1 flex items-center gap-1.5 text-2xl font-extrabold tracking-tight">
          {org.name}
          {org.verified && <BadgeCheck className="size-5 shrink-0 text-primary" aria-label="Organização verificada" />}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{inviter}</span> convidou você para entrar como{" "}
          <span className="font-semibold text-foreground">{ROLE_LABEL[invite.role].toLowerCase()}</span>.
        </p>
      </div>

      <div className="mt-6 flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-relaxed">
        <span className="mt-0.5 text-primary [&_svg]:size-5">{invite.role === "ADMIN" ? <ShieldCheck /> : <UserRoundPen />}</span>
        <p className="text-foreground/85">{roleText}</p>
      </div>

      <div className="mt-6">
        {!user ? (
          <div className="space-y-3">
            <Button asChild variant="primary" size="lg" block>
              <Link href={`/entrar?next=${encodeURIComponent(back)}`}>
                <LogIn /> Entrar para aceitar
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" block>
              <Link href={`/cadastrar?next=${encodeURIComponent(back)}`}>
                <UserPlus /> Criar conta
              </Link>
            </Button>
            <p className="pt-1 text-center text-[13px] text-muted-foreground">
              Use a conta do e-mail <span className="font-semibold text-foreground">{maskEmail(invite.email)}</span>, para onde o convite foi enviado.
            </p>
          </div>
        ) : !sameEmail ? (
          <div className="space-y-4">
            <Alert tone="warning" icon={<TriangleAlert />} title="Este convite é para outro e-mail">
              Você entrou como <span className="font-semibold">{user.email}</span>, mas o convite foi enviado para{" "}
              <span className="font-semibold">{maskEmail(invite.email)}</span>. Entre com a conta desse e-mail para aceitar.
            </Alert>
            <form action={switchAccountForInviteAction}>
              <input type="hidden" name="token" value={token} />
              <Button type="submit" variant="primary" size="lg" block>
                <LogIn /> Entrar com outra conta
              </Button>
            </form>
            <Button asChild variant="ghost" block>
              <Link href="/">Agora não</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <AcceptInviteForm token={token} />
            <Button asChild variant="ghost" block>
              <Link href="/">Agora não</Link>
            </Button>
            <p className="text-center text-[13px] text-muted-foreground">Válido até {formatFullDate(invite.expiresAt)}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

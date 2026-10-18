import "server-only";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { deleteObject } from "@/server/storage";
import { APP_NAME } from "@/lib/constants";
import { DELETE_CONFIRM_WORD } from "./schemas";
import { MeError } from "./service";

/**
 * Direitos do titular (LGPD): portabilidade (exportação) e eliminação (exclusão
 * por anonimização). Regras aqui; autenticação, limite de taxa e auditoria nas actions/rotas.
 */

// ─────────────────────────────────────────────────────────────
// Exportação
// ─────────────────────────────────────────────────────────────

export const EXPORT_FORMAT_VERSION = 1;

/**
 * Todos os dados pessoais da conta em JSON. Nunca inclui hashes de senha,
 * de sessão ou de tokens, nem as chaves das inscrições de push.
 */
export async function buildAccountExport(userId: string, now: Date = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      termsAcceptedAt: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      homeCity: true,
      homeLat: true,
      homeLng: true,
      favoriteCategories: true,
      notifyEmail: true,
      notifyPush: true,
      marketingOptIn: true,
      passwordHash: true,
    },
  });

  const eventRef = { select: { title: true, slug: true, startsAt: true, endsAt: true, city: true, status: true } } as const;

  const [saves, rsvps, follows, notifications, memberships, sessions, oauth, push, tokens, uploads, reports, auditLogs] = await Promise.all([
    prisma.eventSave.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, event: eventRef } }),
    prisma.eventRsvp.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { status: true, createdAt: true, updatedAt: true, reminderSentAt: true, event: eventRef },
    }),
    prisma.follow.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true, organization: { select: { name: true, slug: true } } } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { type: true, title: true, body: true, url: true, readAt: true, createdAt: true },
    }),
    prisma.membership.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { role: true, createdAt: true, organization: { select: { name: true, slug: true } } },
    }),
    prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { ip: true, userAgent: true, createdAt: true, lastActivityAt: true, expiresAt: true },
    }),
    prisma.oAuthAccount.findMany({ where: { userId }, select: { provider: true, providerAccountId: true, createdAt: true } }),
    prisma.pushSubscription.findMany({ where: { userId }, select: { endpoint: true, userAgent: true, createdAt: true } }),
    prisma.verificationToken.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true, expiresAt: true, usedAt: true } }),
    prisma.upload.findMany({ where: { uploadedById: userId }, orderBy: { createdAt: "asc" }, select: { url: true, purpose: true, width: true, height: true, createdAt: true } }),
    prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: "asc" },
      select: { reason: true, details: true, status: true, createdAt: true, event: { select: { title: true, slug: true } } },
    }),
    prisma.auditLog.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: "asc" },
      take: 5000,
      select: { action: true, targetType: true, targetId: true, metadata: true, ip: true, createdAt: true },
    }),
  ]);

  const { passwordHash, homeCity, homeLat, homeLng, favoriteCategories, notifyEmail, notifyPush, marketingOptIn, ...profile } = user;

  return {
    format: `${APP_NAME.toLowerCase()}-account-export`,
    version: EXPORT_FORMAT_VERSION,
    generatedAt: now.toISOString(),
    profile: { ...profile, hasPassword: Boolean(passwordHash) },
    preferences: { homeCity, homeLat, homeLng, favoriteCategories, notifyEmail, notifyPush, marketingOptIn },
    savedEvents: saves.map((s) => ({ savedAt: s.createdAt, event: s.event })),
    rsvps: rsvps.map((r) => ({ status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, reminderSentAt: r.reminderSentAt, event: r.event })),
    following: follows.map((f) => ({ since: f.createdAt, organization: f.organization })),
    notifications,
    organizations: memberships.map((m) => ({ role: m.role, since: m.createdAt, organization: m.organization })),
    sessions,
    connectedAccounts: oauth,
    pushDevices: push.map((p) => ({ service: safeHost(p.endpoint), userAgent: p.userAgent, createdAt: p.createdAt })),
    emailTokens: tokens,
    uploads,
    reports: reports.map((r) => ({ reason: r.reason, details: r.details, status: r.status, createdAt: r.createdAt, event: r.event })),
    activityLog: auditLogs,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Exclusão
// ─────────────────────────────────────────────────────────────

export class AccountDeletionBlocked extends MeError {
  constructor(public organizations: { id: string; name: string; slug: string }[]) {
    super(
      organizations.length === 1
        ? `Você é a única pessoa proprietária de “${organizations[0].name}”. Transfira a propriedade em Painel → Equipe ou encerre a organização antes de excluir sua conta.`
        : `Você é a única pessoa proprietária de ${organizations.length} organizações. Transfira a propriedade em Painel → Equipe ou encerre essas organizações antes de excluir sua conta.`,
    );
  }
}

/** Organizações em que a pessoa é a ÚNICA OWNER (bloqueiam a exclusão da conta). */
export async function soleOwnedOrganizations(userId: string) {
  const owned = await prisma.membership.findMany({
    where: { userId, role: "OWNER" },
    select: {
      organization: { select: { id: true, name: true, slug: true, _count: { select: { members: { where: { role: "OWNER" } } } } } },
    },
  });
  return owned.filter((m) => m.organization._count.members <= 1).map(({ organization: { id, name, slug } }) => ({ id, name, slug }));
}

export function anonymizedEmail(userId: string) {
  return `deleted+${userId}@mixtour.invalid`;
}

export const DELETED_NAME = "Conta excluída";

export interface DeletionConfirmation {
  password?: string;
  confirm?: string;
}

/**
 * Exclui a conta por anonimização: o registro do usuário permanece (para manter a
 * integridade de auditoria e moderação), mas sem nenhum dado pessoal; todo o
 * vínculo pessoal (sessões, contas Google, push, tokens, salvos, presenças,
 * seguidos, notificações e equipes) é removido e os contadores dos eventos ajustados.
 */
export async function deleteAccount(userId: string, confirmation: DeletionConfirmation, now: Date = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true, passwordHash: true } });
  if (!user || user.status === "DELETED") throw new MeError("Conta não encontrada.");

  if (user.passwordHash) {
    const ok = confirmation.password ? await verifyPassword(confirmation.password, user.passwordHash) : false;
    if (!ok) throw new MeError("Senha incorreta.", { password: "Senha incorreta" });
  } else if ((confirmation.confirm ?? "").trim().toUpperCase() !== DELETE_CONFIRM_WORD) {
    throw new MeError(`Digite ${DELETE_CONFIRM_WORD} para confirmar.`, { confirm: `Digite ${DELETE_CONFIRM_WORD}` });
  }

  const blocking = await soleOwnedOrganizations(userId);
  if (blocking.length) throw new AccountDeletionBlocked(blocking);

  const anonEmail = anonymizedEmail(userId);
  const summary = await prisma.$transaction(async (tx) => {
    // Remove salvos/presenças e ajusta os contadores na MESMA instrução (sem janela de corrida).
    const saves = await tx.$executeRaw`
      WITH d AS (DELETE FROM "EventSave" WHERE "userId" = ${userId} RETURNING "eventId")
      UPDATE "Event" e SET "savesCount" = GREATEST(e."savesCount" - 1, 0) FROM d WHERE e."id" = d."eventId"`;
    const goingRows = await tx.$queryRaw<{ n: bigint }[]>`
      WITH d AS (DELETE FROM "EventRsvp" WHERE "userId" = ${userId} RETURNING "eventId", "status"),
      u AS (
        UPDATE "Event" e SET "goingCount" = GREATEST(e."goingCount" - 1, 0)
        FROM d WHERE e."id" = d."eventId" AND d."status" = 'GOING'
        RETURNING e."id"
      )
      SELECT (SELECT COUNT(*) FROM d) AS n`;
    const rsvps = Number(goingRows[0]?.n ?? 0);

    const [follows, notifications, memberships, sessions, oauth, push, tokens, invites] = [
      await tx.follow.deleteMany({ where: { userId } }),
      await tx.notification.deleteMany({ where: { userId } }),
      await tx.membership.deleteMany({ where: { userId } }),
      await tx.session.deleteMany({ where: { userId } }),
      await tx.oAuthAccount.deleteMany({ where: { userId } }),
      await tx.pushSubscription.deleteMany({ where: { userId } }),
      await tx.verificationToken.deleteMany({ where: { userId } }),
      await tx.orgInvite.deleteMany({ where: { email: user.email, acceptedAt: null } }),
    ];

    const avatars = await tx.upload.findMany({ where: { uploadedById: userId, purpose: "avatar" }, select: { id: true, key: true } });
    if (avatars.length) await tx.upload.deleteMany({ where: { id: { in: avatars.map((a) => a.id) } } });

    // Histórico de e-mails: mantém o registro operacional, sem destinatário nem conteúdo.
    await tx.emailOutbox.updateMany({
      where: { to: user.email },
      data: { to: anonEmail, html: "[conteúdo removido: conta excluída]", text: "[conteúdo removido: conta excluída]" },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        deletedAt: now,
        email: anonEmail,
        name: DELETED_NAME,
        passwordHash: null,
        emailVerifiedAt: null,
        avatarUrl: null,
        homeCity: null,
        homeLat: null,
        homeLng: null,
        favoriteCategories: [],
        notifyEmail: false,
        notifyPush: false,
        marketingOptIn: false,
        lastLoginAt: null,
      },
    });

    return {
      saves,
      rsvps,
      follows: follows.count,
      notifications: notifications.count,
      memberships: memberships.count,
      sessions: sessions.count,
      oauthAccounts: oauth.count,
      pushSubscriptions: push.count,
      tokens: tokens.count,
      invites: invites.count,
      avatarKeys: avatars.map((a) => a.key),
    };
  });

  // Arquivos de foto: fora da transação (armazenamento externo); falhas não desfazem a exclusão.
  await Promise.all(
    summary.avatarKeys.flatMap((key) => [key, key.replace(/\.webp$/, "-thumb.webp")]).map((k) => deleteObject(k).catch(() => undefined)),
  );

  const { avatarKeys, ...counts } = summary;
  return { ...counts, avatars: avatarKeys.length };
}

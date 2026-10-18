import { beforeEach, describe, expect, it } from "vitest";
import { setFollow, setRsvp, setSaved } from "@/server/engagement/service";
import { AccountDeletionBlocked, anonymizedEmail, buildAccountExport, deleteAccount, soleOwnedOrganizations } from "@/server/me/account";
import { removePushSubscription, savePushSubscription } from "@/server/me/push";
import { pushSubscriptionSchema } from "@/server/me/schemas";
import {
  getProfile,
  listNotifications,
  listSessions,
  markAllNotificationsRead,
  markNotificationRead,
  MeError,
  revokeOtherSessions,
  revokeSession,
  setAvatar,
  setPreference,
  updateProfile,
} from "@/server/me/service";
import { createEvent, createOrg, createUser, prisma, resetDb, TEST_PASSWORD } from "../helpers";

beforeEach(resetDb);

async function notif(userId: string, title: string, data: { url?: string; createdAt?: Date } = {}) {
  return prisma.notification.create({ data: { userId, type: "SYSTEM", title, url: data.url, createdAt: data.createdAt } });
}

async function session(userId: string, ua = "Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36") {
  return prisma.session.create({
    data: { userId, tokenHash: `hash-${Math.random()}`, ip: "189.40.12.200", userAgent: ua, expiresAt: new Date(Date.now() + 86_400_000) },
  });
}

describe("notificações", () => {
  it("lista paginada, mais recentes primeiro, só da própria pessoa e sem URLs externas", async () => {
    const me = await createUser();
    const other = await createUser();
    const base = Date.now();
    for (let i = 0; i < 5; i++) await notif(me.id, `n${i}`, { createdAt: new Date(base - i * 1000), url: i === 0 ? "https://evil.com" : `/evento/e${i}` });
    await notif(other.id, "alheia");

    const p1 = await listNotifications(me.id, { take: 3 });
    expect(p1.items.map((n) => n.title)).toEqual(["n0", "n1", "n2"]);
    expect(p1.items[0].url).toBeNull();
    expect(p1.items[1].url).toBe("/evento/e1");
    expect(p1.nextCursor).toBe(p1.items[2].id);
    const p2 = await listNotifications(me.id, { take: 3, before: p1.nextCursor });
    expect(p2.items.map((n) => n.title)).toEqual(["n3", "n4"]);
    expect(p2.nextCursor).toBeNull();
  });

  it("marcar como lida só funciona para as próprias notificações", async () => {
    const me = await createUser();
    const other = await createUser();
    const mine = await notif(me.id, "minha", { url: "/salvos" });
    const theirs = await notif(other.id, "dela");

    expect(await markNotificationRead(me.id, theirs.id)).toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();

    expect(await markNotificationRead(me.id, mine.id)).toEqual({ url: "/salvos" });
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();

    await notif(me.id, "outra");
    expect(await markAllNotificationsRead(me.id)).toBe(1);
    expect(await prisma.notification.count({ where: { userId: other.id, readAt: null } })).toBe(1);
  });
});

describe("perfil e preferências", () => {
  it("atualiza nome, cidade e só categorias ativas existentes", async () => {
    const me = await createUser();
    await prisma.category.update({ where: { slug: "cinema" }, data: { active: false } });
    await updateProfile(me.id, { name: "Ana", homeCity: "Recife – PE", homeLat: -8.05, homeLng: -34.9, favoriteCategories: ["shows", "cinema", "inexistente"] });
    const p = await getProfile(me.id);
    expect(p).toMatchObject({ name: "Ana", homeCity: "Recife – PE", homeLat: -8.05, homeLng: -34.9, favoriteCategories: ["shows"], hasPassword: true });
    expect(p).not.toHaveProperty("passwordHash");
  });

  it("preferências de notificação", async () => {
    const me = await createUser();
    expect(await setPreference(me.id, "notifyEmail", false)).toEqual({ notifyEmail: false, notifyPush: true, marketingOptIn: false });
    expect((await setPreference(me.id, "marketingOptIn", true)).marketingOptIn).toBe(true);
  });

  it("foto: só aceita upload de avatar da própria pessoa", async () => {
    const me = await createUser();
    const other = await createUser();
    const mk = (uploadedById: string, purpose: string, url: string) =>
      prisma.upload.create({ data: { key: url.slice(1), url, mimeType: "image/webp", width: 1, height: 1, bytes: 1, purpose, uploadedById } });
    await mk(me.id, "avatar", "/media/avatars/me.webp");
    await mk(other.id, "avatar", "/media/avatars/other.webp");
    await mk(me.id, "event-cover", "/media/orgs/x.webp");

    await expect(setAvatar(me.id, "https://evil.com/x.png")).rejects.toBeInstanceOf(MeError);
    await expect(setAvatar(me.id, "/media/avatars/other.webp")).rejects.toBeInstanceOf(MeError);
    await expect(setAvatar(me.id, "/media/orgs/x.webp")).rejects.toBeInstanceOf(MeError);
    await setAvatar(me.id, "/media/avatars/me.webp");
    expect((await getProfile(me.id)).avatarUrl).toBe("/media/avatars/me.webp");
    await setAvatar(me.id, null);
    expect((await getProfile(me.id)).avatarUrl).toBeNull();
  });
});

describe("sessões", () => {
  it("lista com a atual primeiro e IP mascarado; encerra só as próprias", async () => {
    const me = await createUser();
    const other = await createUser();
    const current = await session(me.id);
    const old = await session(me.id, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile/15E148 Safari/604.1");
    const theirs = await session(other.id);

    const list = await listSessions(me.id, current.id);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: current.id, current: true, ip: "189.40.•••.•••" });
    expect(list[1].device.os).toBe("iOS");
    expect(JSON.stringify(list)).not.toContain("hash-");

    expect(await revokeSession(me.id, theirs.id, current.id)).toBe(false);
    await expect(revokeSession(me.id, current.id, current.id)).rejects.toBeInstanceOf(MeError);
    expect(await revokeSession(me.id, old.id, current.id)).toBe(true);
    await session(me.id);
    expect(await revokeOtherSessions(me.id, current.id)).toBe(1);
    expect(await prisma.session.count({ where: { userId: me.id } })).toBe(1);
    expect(await prisma.session.count({ where: { userId: other.id } })).toBe(1);
  });
});

describe("push", () => {
  const sub = (endpoint = "https://fcm.googleapis.com/fcm/send/abc123") =>
    pushSubscriptionSchema.parse({ endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });

  it("valida endpoint (https público) antes de salvar", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://fcm.googleapis.com/x", keys: { p256dh: "abcdefgh", auth: "abcdefgh" } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://10.0.0.1/x", keys: { p256dh: "abcdefgh", auth: "abcdefgh" } }).success).toBe(false);
  });

  it("salva, reatribui o mesmo navegador a quem está logado e só remove a própria inscrição", async () => {
    const a = await createUser({ notifyPush: false });
    const b = await createUser();
    await savePushSubscription(a.id, sub(), "UA");
    expect((await getProfile(a.id)).notifyPush).toBe(true);
    expect(await removePushSubscription(b.id, sub().endpoint)).toBe(false);
    await savePushSubscription(b.id, sub(), "UA");
    expect(await prisma.pushSubscription.count()).toBe(1);
    expect((await prisma.pushSubscription.findFirstOrThrow()).userId).toBe(b.id);
    expect(await removePushSubscription(b.id, sub().endpoint)).toBe(true);
  });
});

describe("exportação (LGPD)", () => {
  it("contém os dados da pessoa e nenhum hash ou segredo", async () => {
    const me = await createUser({ name: "Bia", homeCity: "Recife – PE" });
    const owner = await createUser();
    const org = await createOrg(owner.id, { name: "Org Exportada" });
    await prisma.membership.create({ data: { organizationId: org.id, userId: me.id, role: "EDITOR" } });
    const ev = await createEvent(org.id, { title: "Show exportado" });
    await setSaved(me.id, ev.id, true);
    await setRsvp(me.id, ev.id, "GOING");
    await setFollow(me.id, org.id, true);
    await notif(me.id, "Bem-vinda");
    const s = await session(me.id);
    await prisma.verificationToken.create({ data: { userId: me.id, type: "EMAIL_VERIFY", tokenHash: "token-hash-secreto", expiresAt: new Date(Date.now() + 1e6) } });
    await savePushSubscription(me.id, pushSubscriptionSchema.parse({ endpoint: "https://fcm.googleapis.com/fcm/send/segredo-endpoint", keys: { p256dh: "chave-p256dh-secreta", auth: "auth-secreta" } }), "UA");
    await prisma.auditLog.create({ data: { actorId: me.id, action: "user.login", ip: "1.2.3.4" } });
    await prisma.auditLog.create({ data: { actorId: owner.id, action: "user.login" } });

    const data = await buildAccountExport(me.id);
    expect(data.profile).toMatchObject({ name: "Bia", email: me.email, hasPassword: true });
    expect(data.preferences.homeCity).toBe("Recife – PE");
    expect(data.savedEvents[0].event.title).toBe("Show exportado");
    expect(data.rsvps[0].status).toBe("GOING");
    expect(data.following[0].organization.name).toBe("Org Exportada");
    expect(data.notifications[0].title).toBe("Bem-vinda");
    expect(data.organizations[0]).toMatchObject({ role: "EDITOR", organization: { name: "Org Exportada" } });
    expect(data.sessions).toHaveLength(1);
    expect(data.pushDevices[0].service).toBe("fcm.googleapis.com");
    expect(data.activityLog).toHaveLength(1);

    const json = JSON.stringify(data);
    for (const secret of [me.passwordHash!, s.tokenHash, "token-hash-secreto", "chave-p256dh-secreta", "auth-secreta", "segredo-endpoint"]) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("tokenHash");
  });
});

describe("exclusão de conta", () => {
  it("bloqueia quando a pessoa é a única OWNER de uma organização", async () => {
    const me = await createUser();
    const org = await createOrg(me.id, { name: "Minha Produtora" });
    expect((await soleOwnedOrganizations(me.id)).map((o) => o.name)).toEqual(["Minha Produtora"]);
    await expect(deleteAccount(me.id, { password: TEST_PASSWORD })).rejects.toBeInstanceOf(AccountDeletionBlocked);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: me.id } })).status).toBe("ACTIVE");

    // Com outra OWNER, pode excluir.
    const partner = await createUser();
    await prisma.membership.create({ data: { organizationId: org.id, userId: partner.id, role: "OWNER" } });
    expect(await soleOwnedOrganizations(me.id)).toEqual([]);
    await deleteAccount(me.id, { password: TEST_PASSWORD });
    expect(await prisma.membership.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("exige a senha correta (ou EXCLUIR em contas só-Google)", async () => {
    const me = await createUser();
    await expect(deleteAccount(me.id, { password: "errada123" })).rejects.toThrow("Senha incorreta");
    const google = await createUser({ passwordHash: null });
    await expect(deleteAccount(google.id, { confirm: "sim" })).rejects.toBeInstanceOf(MeError);
    await deleteAccount(google.id, { confirm: "excluir" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: google.id } })).status).toBe("DELETED");
  });

  it("anonimiza, remove vínculos pessoais e ajusta os contadores dos eventos", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const ev1 = await createEvent(org.id, { title: "E1" });
    const ev2 = await createEvent(org.id, { title: "E2" });
    const me = await createUser({ name: "Carla", homeCity: "Recife – PE", homeLat: -8, homeLng: -34, favoriteCategories: ["shows"], avatarUrl: "/media/avatars/c.webp", marketingOptIn: true });
    const fan = await createUser();

    await setSaved(me.id, ev1.id, true);
    await setSaved(fan.id, ev1.id, true);
    await setRsvp(me.id, ev1.id, "GOING");
    await setRsvp(fan.id, ev1.id, "GOING");
    await setRsvp(me.id, ev2.id, "INTERESTED");
    await setFollow(me.id, org.id, true);
    await notif(me.id, "oi");
    await session(me.id);
    await prisma.oAuthAccount.create({ data: { userId: me.id, provider: "google", providerAccountId: "g-123" } });
    await prisma.verificationToken.create({ data: { userId: me.id, type: "PASSWORD_RESET", tokenHash: "t-1", expiresAt: new Date(Date.now() + 1e6) } });
    await prisma.membership.create({ data: { organizationId: org.id, userId: me.id, role: "EDITOR" } });
    await prisma.orgInvite.create({ data: { organizationId: org.id, email: me.email, tokenHash: "inv-1", expiresAt: new Date(Date.now() + 1e6) } });
    await prisma.emailOutbox.create({ data: { to: me.email, subject: "Oi", template: "x", html: "<p>Carla</p>", text: "Carla", status: "SKIPPED" } });
    await savePushSubscription(me.id, pushSubscriptionSchema.parse({ endpoint: "https://fcm.googleapis.com/fcm/send/zzz", keys: { p256dh: "abcdefgh12", auth: "abcdefgh12" } }), null);

    const before = await prisma.event.findUniqueOrThrow({ where: { id: ev1.id } });
    expect(before).toMatchObject({ savesCount: 2, goingCount: 2 });

    const summary = await deleteAccount(me.id, { password: TEST_PASSWORD });
    expect(summary).toMatchObject({ saves: 1, rsvps: 2, follows: 1, notifications: 1, memberships: 1, sessions: 1, oauthAccounts: 1, pushSubscriptions: 1, invites: 1 });

    const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(u).toMatchObject({
      status: "DELETED",
      email: anonymizedEmail(me.id),
      name: "Conta excluída",
      passwordHash: null,
      avatarUrl: null,
      homeCity: null,
      homeLat: null,
      homeLng: null,
      favoriteCategories: [],
      marketingOptIn: false,
      notifyEmail: false,
      notifyPush: false,
      emailVerifiedAt: null,
    });
    expect(u.deletedAt).not.toBeNull();

    const e1 = await prisma.event.findUniqueOrThrow({ where: { id: ev1.id } });
    expect(e1).toMatchObject({ savesCount: 1, goingCount: 1 });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev2.id } })).goingCount).toBe(0);

    for (const count of await Promise.all([
      prisma.eventSave.count({ where: { userId: me.id } }),
      prisma.eventRsvp.count({ where: { userId: me.id } }),
      prisma.follow.count({ where: { userId: me.id } }),
      prisma.notification.count({ where: { userId: me.id } }),
      prisma.membership.count({ where: { userId: me.id } }),
      prisma.session.count({ where: { userId: me.id } }),
      prisma.oAuthAccount.count({ where: { userId: me.id } }),
      prisma.pushSubscription.count({ where: { userId: me.id } }),
      prisma.verificationToken.count({ where: { userId: me.id } }),
      prisma.orgInvite.count({ where: { email: me.email } }),
      prisma.emailOutbox.count({ where: { to: me.email } }),
    ])) {
      expect(count).toBe(0);
    }
    // Os dados de outras pessoas ficam intactos.
    expect(await prisma.eventSave.count({ where: { userId: fan.id } })).toBe(1);
    expect(await prisma.eventRsvp.count({ where: { userId: fan.id } })).toBe(1);

    // Não dá para excluir duas vezes.
    await expect(deleteAccount(me.id, { password: TEST_PASSWORD })).rejects.toBeInstanceOf(MeError);
  });
});

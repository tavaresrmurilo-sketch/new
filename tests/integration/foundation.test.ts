import { beforeEach, describe, expect, it } from "vitest";
import { consumeToken, issueToken } from "@/server/auth/tokens";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { assertCanActivateEvent, PlanLimitError } from "@/server/billing/plans";
import { sendEmail } from "@/server/email";
import { verifyEmailMessage } from "@/server/email/templates";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/security/rate-limit";
import { getSetting, setSetting } from "@/server/settings";
import { createEvent, createOrg, createUser, prisma, resetDb, setPlan } from "../helpers";

beforeEach(resetDb);

describe("tokens de uso único", () => {
  it("são consumidos uma única vez e invalidam os anteriores", async () => {
    const u = await createUser();
    const t1 = await issueToken(u.id, "EMAIL_VERIFY");
    const t2 = await issueToken(u.id, "EMAIL_VERIFY");
    expect(await consumeToken(t1, "EMAIL_VERIFY")).toBeNull();
    expect(await consumeToken(t2, "PASSWORD_RESET")).toBeNull();
    expect(await consumeToken(t2, "EMAIL_VERIFY")).toBe(u.id);
    expect(await consumeToken(t2, "EMAIL_VERIFY")).toBeNull();
    const stored = await prisma.verificationToken.findMany({ where: { userId: u.id } });
    expect(stored.every((s) => s.tokenHash !== t2)).toBe(true);
  });

  it("expirados são recusados", async () => {
    const u = await createUser();
    const t = await issueToken(u.id, "PASSWORD_RESET");
    await prisma.verificationToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await consumeToken(t, "PASSWORD_RESET")).toBeNull();
  });
});

describe("senhas", () => {
  it("bcrypt", async () => {
    const h = await hashPassword("senha12345");
    expect(await verifyPassword("senha12345", h)).toBe(true);
    expect(await verifyPassword("outra12345", h)).toBe(false);
  });
});

describe("rate limit compartilhado (PostgreSQL)", () => {
  it("bloqueia após o limite e informa a espera", async () => {
    for (let i = 0; i < 5; i++) expect((await rateLimit("register", "1.2.3.4")).allowed).toBe(true);
    const blocked = await rateLimit("register", "1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await rateLimit("register", "5.6.7.8")).allowed).toBe(true);
  });
  it("reinicia a janela vencida", async () => {
    for (let i = 0; i < 6; i++) await rateLimit("register", "9.9.9.9");
    await prisma.rateLimitBucket.updateMany({ data: { resetAt: new Date(Date.now() - 1000) } });
    expect((await rateLimit("register", "9.9.9.9")).allowed).toBe(true);
  });
});

describe("e-mail e notificações", () => {
  it("sem provedor, registra no outbox como SKIPPED", async () => {
    const r = await sendEmail("pessoa@teste.dev", verifyEmailMessage("Pessoa", "tok"));
    expect(r.status).toBe("SKIPPED");
    const row = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.html).toContain("/verificar-email?token=tok");
  });
  it("notificação in-app respeita usuário ativo", async () => {
    const u = await createUser();
    const n = await notify(u.id, { type: "SYSTEM", title: "Olá" });
    expect(n?.title).toBe("Olá");
    const suspended = await createUser({ status: "SUSPENDED" });
    expect(await notify(suspended.id, { type: "SYSTEM", title: "Olá" })).toBeNull();
  });
});

describe("busca textual", () => {
  it("o trigger indexa sem acentos", async () => {
    const u = await createUser();
    const org = await createOrg(u.id);
    await createEvent(org.id, { title: "Arraiá de São João", venueName: "Praça Central", tags: ["forró"] });
    const rows = await prisma.$queryRaw<{ title: string }[]>`
      SELECT title FROM "Event" WHERE "searchVector" @@ to_tsquery('simple', mx_unaccent('sao') || ':*') AND "searchVector" @@ to_tsquery('simple', mx_unaccent('forro') || ':*')`;
    expect(rows.map((r) => r.title)).toEqual(["Arraiá de São João"]);
  });
});

describe("limites do plano", () => {
  it("plano gratuito permite 3 eventos ativos", async () => {
    const u = await createUser();
    const org = await createOrg(u.id);
    for (let i = 0; i < 3; i++) await createEvent(org.id);
    await expect(assertCanActivateEvent(org.id)).rejects.toBeInstanceOf(PlanLimitError);
    // eventos encerrados não contam
    await prisma.event.updateMany({ where: { organizationId: org.id }, data: { endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - 7200_000) } });
    await expect(assertCanActivateEvent(org.id)).resolves.toBeUndefined();
    await setPlan(org.id, "PRO");
    for (let i = 0; i < 5; i++) await createEvent(org.id);
    await expect(assertCanActivateEvent(org.id)).resolves.toBeUndefined();
  });
});

describe("configurações", () => {
  it("valor padrão e sobrescrita", async () => {
    expect(await getSetting("moderation.mode")).toBe("new_orgs");
    await setSetting("moderation.mode", "all");
    expect(await getSetting("moderation.mode")).toBe("all");
  });
});

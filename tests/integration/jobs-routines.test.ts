import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as cronGet } from "@/app/api/cron/[job]/route";
import { resetEnvCache } from "@/server/env";
import { reminderTitle, runJob, runMaintenance, runReminders } from "@/server/jobs";
import { isAuthorizedCron } from "@/server/jobs/cron-auth";
import { metricDay } from "@/server/engagement/service";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

const H = 3_600_000;
const D = 24 * H;

function cron(job: string, auth?: string) {
  const req = new Request(`http://localhost:3000/api/cron/${job}`, { headers: auth ? { authorization: auth } : {} });
  return cronGet(req, { params: Promise.resolve({ job }) } as RouteContext<"/api/cron/[job]">);
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  resetEnvCache();
});

describe("lembretes", () => {
  it("avisa GOING/INTERESTED de eventos nas próximas 36 h, uma única vez", async () => {
    const now = new Date("2026-10-18T12:00:00.000Z"); // 09:00 em São Paulo
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const soon = await createEvent(org.id, { title: "Samba no fim de tarde", startsAt: new Date(now.getTime() + 8 * H) });
    const tomorrow = await createEvent(org.id, { title: "Feira de domingo", startsAt: new Date(now.getTime() + 26 * H) });
    const far = await createEvent(org.id, { title: "Longe demais", startsAt: new Date(now.getTime() + 40 * H) });
    const past = await createEvent(org.id, { title: "Já começou", startsAt: new Date(now.getTime() - H) });
    const draft = await createEvent(org.id, { title: "Rascunho", status: "DRAFT", publishedAt: null, startsAt: new Date(now.getTime() + 5 * H) });

    const going = await createUser();
    const interested = await createUser();
    const suspended = await createUser({ status: "SUSPENDED" });
    for (const e of [soon, tomorrow, far, past, draft]) await prisma.eventRsvp.create({ data: { userId: going.id, eventId: e.id, status: "GOING" } });
    await prisma.eventRsvp.create({ data: { userId: interested.id, eventId: soon.id, status: "INTERESTED" } });
    await prisma.eventRsvp.create({ data: { userId: suspended.id, eventId: soon.id, status: "GOING" } });

    const first = await runReminders(now);
    expect(first.sent).toBe(3);
    expect(first.events).toBe(2);

    const notes = await prisma.notification.findMany({ where: { type: "EVENT_REMINDER" }, orderBy: { title: "asc" } });
    expect(notes.map((n) => n.title).sort()).toEqual(
      ["Amanhã: Feira de domingo às 11:00", "Hoje: Samba no fim de tarde às 17:00", "Hoje: Samba no fim de tarde às 17:00"].sort(),
    );
    expect(await prisma.emailOutbox.count({ where: { template: "event-reminder" } })).toBe(3);
    expect(await prisma.eventRsvp.count({ where: { reminderSentAt: { not: null } } })).toBe(3);
    expect(await prisma.eventRsvp.findUniqueOrThrow({ where: { userId_eventId: { userId: going.id, eventId: far.id } } })).toMatchObject({ reminderSentAt: null });

    const second = await runReminders(new Date(now.getTime() + H));
    expect(second.sent).toBe(0);
    expect(await prisma.notification.count({ where: { type: "EVENT_REMINDER" } })).toBe(3);
  });

  it("monta o título com o horário local do evento", () => {
    const now = new Date("2026-10-18T12:00:00.000Z");
    expect(reminderTitle({ title: "Show", startsAt: new Date("2026-10-19T23:30:00.000Z"), timezone: "America/Sao_Paulo" }, now)).toBe("Amanhã: Show às 20:30");
    expect(reminderTitle({ title: "Show", startsAt: new Date("2026-10-18T22:00:00.000Z"), timezone: "America/Manaus" }, now)).toBe("Hoje: Show às 18:00");
  });
});

describe("manutenção", () => {
  it("arquiva encerrados há mais de 24 h e limpa dados temporários", async () => {
    const now = new Date();
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const old = await createEvent(org.id, { startsAt: new Date(now.getTime() - 3 * D), endsAt: new Date(now.getTime() - 2 * D) });
    const recent = await createEvent(org.id, { startsAt: new Date(now.getTime() - 10 * H), endsAt: new Date(now.getTime() - 2 * H) });
    const upcoming = await createEvent(org.id);

    await prisma.session.create({ data: { userId: owner.id, tokenHash: "expired", expiresAt: new Date(now.getTime() - H) } });
    await prisma.session.create({ data: { userId: owner.id, tokenHash: "valid", expiresAt: new Date(now.getTime() + D) } });
    await prisma.verificationToken.create({ data: { userId: owner.id, type: "EMAIL_VERIFY", tokenHash: "t-used-old", expiresAt: new Date(now.getTime() + D), usedAt: new Date(now.getTime() - 8 * D) } });
    await prisma.verificationToken.create({ data: { userId: owner.id, type: "PASSWORD_RESET", tokenHash: "t-expired-old", expiresAt: new Date(now.getTime() - 8 * D) } });
    await prisma.verificationToken.create({ data: { userId: owner.id, type: "PASSWORD_RESET", tokenHash: "t-fresh", expiresAt: new Date(now.getTime() - D) } });
    const today = metricDay(now);
    await prisma.eventViewMark.create({ data: { eventId: upcoming.id, visitorHash: "v1", day: new Date(today.getTime() - 4 * D) } });
    await prisma.eventViewMark.create({ data: { eventId: upcoming.id, visitorHash: "v2", day: today } });
    await prisma.rateLimitBucket.create({ data: { key: "old", count: 1, resetAt: new Date(now.getTime() - 2 * H) } });
    await prisma.rateLimitBucket.create({ data: { key: "live", count: 1, resetAt: new Date(now.getTime() + H) } });
    await prisma.geocodeCache.create({ data: { queryHash: "g-old", kind: "search", query: "x", result: {}, createdAt: new Date(now.getTime() - 91 * D) } });
    await prisma.geocodeCache.create({ data: { queryHash: "g-new", kind: "search", query: "y", result: {} } });
    await prisma.orgInvite.create({ data: { organizationId: org.id, email: "x@teste.dev", tokenHash: "inv-old", expiresAt: new Date(now.getTime() - 31 * D) } });
    await prisma.orgInvite.create({ data: { organizationId: org.id, email: "y@teste.dev", tokenHash: "inv-new", expiresAt: new Date(now.getTime() - 2 * D) } });

    const res = await runMaintenance(now);
    expect(res).toEqual({ archivedEvents: 1, expiredSessions: 1, oldTokens: 2, viewMarks: 1, rateLimitBuckets: 1, geocodeCache: 1, expiredInvites: 1 });
    expect((await prisma.event.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("ARCHIVED");
    expect((await prisma.event.findUniqueOrThrow({ where: { id: recent.id } })).status).toBe("PUBLISHED");
    expect(await prisma.session.count()).toBe(1);
    expect(await prisma.verificationToken.count()).toBe(1);
  });

  it("runJob grava JobRun com status, detalhes e duração", async () => {
    const run = await runJob("daily", { trigger: "manual" });
    expect(run.status).toBe("success");
    const row = await prisma.jobRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(row.status).toBe("success");
    expect(row.finishedAt).not.toBeNull();
    expect(row.detail).toMatchObject({ trigger: "manual", result: { reminders: { sent: 0 }, maintenance: { archivedEvents: 0 } } });
    expect(typeof (row.detail as { durationMs: number }).durationMs).toBe("number");
  });
});

describe("rota de cron", () => {
  it("compara o segredo em tempo constante", () => {
    expect(isAuthorizedCron("Bearer abc", "abc")).toBe(true);
    expect(isAuthorizedCron("bearer abc", "abc")).toBe(true);
    expect(isAuthorizedCron("Bearer abcd", "abc")).toBe(false);
    expect(isAuthorizedCron("abc", "abc")).toBe(false);
    expect(isAuthorizedCron(null, "abc")).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
  });

  it("401 sem cabeçalho, com segredo errado ou sem CRON_SECRET; 200 com o segredo certo", async () => {
    expect((await cron("daily")).status).toBe(401);
    expect((await cron("daily", "Bearer errado")).status).toBe(401);
    expect(await prisma.jobRun.count()).toBe(0);

    const ok = await cron("maintenance", "Bearer test-cron-secret");
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok: boolean; job: string; runId: string };
    expect(body).toMatchObject({ ok: true, job: "maintenance" });
    expect(await prisma.jobRun.count({ where: { id: body.runId, status: "success" } })).toBe(1);
    expect((await cron("nao-existe", "Bearer test-cron-secret")).status).toBe(404);

    process.env.CRON_SECRET = "";
    resetEnvCache();
    expect((await cron("daily", "Bearer test-cron-secret")).status).toBe(401);
    expect((await cron("daily", "Bearer ")).status).toBe(401);
  });
});

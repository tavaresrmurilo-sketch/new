import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { listedEventWhere } from "@/server/events/visibility";
import {
  approveEvent,
  dismissReport,
  listReports,
  moderationQueue,
  rejectEvent,
  resolveReport,
  unpublishEvent,
} from "@/server/moderation/service";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

async function setup() {
  const admin = await createUser({ role: "ADMIN", name: "Equipe Mixtour" });
  const owner = await createUser({ name: "Dona da Casa" });
  const editor = await createUser({ name: "Editor" });
  const org = await createOrg(owner.id, { name: "Casa Nova" });
  await prisma.membership.create({ data: { organizationId: org.id, userId: editor.id, role: "EDITOR" } });
  const follower = await createUser({ name: "Seguidora" });
  await prisma.follow.create({ data: { userId: follower.id, organizationId: org.id } });
  const event = await createEvent(org.id, { title: "Festa de estreia", status: "PENDING_REVIEW", publishedAt: null, submittedAt: new Date() });
  return { admin, owner, editor, org, follower, event, actor: { id: admin.id, ip: "203.0.113.9" } };
}

beforeEach(async () => {
  await resetDb();
});

describe("fila de moderação", () => {
  it("lista os pendentes mais antigos primeiro e sinaliza organização nova", async () => {
    const { org } = await setup();
    const older = await createEvent(org.id, { title: "Mais antigo", status: "PENDING_REVIEW", publishedAt: null, submittedAt: new Date(Date.now() - 86_400_000) });
    const queue = await moderationQueue(1);
    expect(queue.total).toBe(2);
    expect(queue.items[0].id).toBe(older.id);
    expect(queue.items[0].orgHistory.isNew).toBe(true);
  });
});

describe("aprovação", () => {
  it("publica, registra revisão, avisa equipe (in-app + e-mail) e seguidores", async () => {
    const { actor, event, owner, editor, follower, org } = await setup();
    const res = await approveEvent(actor, event.id, { trustOrganization: true });
    expect(res.followersNotified).toBe(1);
    expect(res.teamNotified).toBe(2);

    const after = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.status).toBe("PUBLISHED");
    expect(after.publishedAt).not.toBeNull();
    expect(after.reviewedById).toBe(actor.id);
    expect(after.reviewedAt).not.toBeNull();

    const approved = await prisma.notification.findMany({ where: { type: "EVENT_APPROVED" } });
    expect(approved.map((n) => n.userId).sort()).toEqual([owner.id, editor.id].sort());
    const followerNote = await prisma.notification.findFirst({ where: { userId: follower.id, type: "NEW_EVENT_FROM_FOLLOWED" } });
    expect(followerNote?.url).toBe(`/evento/${event.slug}`);
    expect(await prisma.emailOutbox.count({ where: { template: "event-approved" } })).toBe(2);

    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).trustedPublisher).toBe(true);
    const log = await prisma.auditLog.findFirst({ where: { action: "moderation.approve", targetId: event.id } });
    expect(log?.actorId).toBe(actor.id);
    expect(log?.ip).toBe("203.0.113.9");
    expect(await prisma.auditLog.count({ where: { action: "admin.org.trust", targetId: org.id } })).toBe(1);

    // Já não está mais em análise.
    await expect(approveEvent(actor, event.id)).rejects.toThrow(/não está mais em análise/);
  });

  it("não aprova evento de organização suspensa", async () => {
    const { actor, event, org } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    await expect(approveEvent(actor, event.id)).rejects.toThrow(/suspensa/);
  });
});

describe("recusa e retirada do ar", () => {
  it("recusa com motivo obrigatório e avisa a equipe com o motivo", async () => {
    const { actor, event, owner } = await setup();
    await expect(rejectEvent(actor, event.id, "curto")).rejects.toThrow(/pelo menos/);
    await rejectEvent(actor, event.id, "A data informada já passou. Ajuste e envie de novo.");
    const after = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.status).toBe("REJECTED");
    expect(after.rejectionReason).toContain("data informada");
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: owner.id, type: "EVENT_REJECTED" } });
    expect(note.body).toContain("data informada");
    expect(note.url).toBe(`/painel/eventos/${event.id}`);
    const mail = await prisma.emailOutbox.findFirstOrThrow({ where: { template: "event-rejected" } });
    expect(mail.text).toContain("data informada");
    expect(await prisma.auditLog.count({ where: { action: "moderation.reject", targetId: event.id } })).toBe(1);
  });

  it("despublica evento publicado: some do público e volta a recusado", async () => {
    const { actor, org } = await setup();
    const live = await createEvent(org.id, { title: "No ar" });
    expect(await prisma.event.count({ where: { id: live.id, ...listedEventWhere() } })).toBe(1);
    await unpublishEvent(actor, live.id, "Ingressos vendidos fora da plataforma oficial.");
    const after = await prisma.event.findUniqueOrThrow({ where: { id: live.id } });
    expect(after.status).toBe("REJECTED");
    expect(await prisma.event.count({ where: { id: live.id, ...listedEventWhere() } })).toBe(0);
    expect(await prisma.notification.count({ where: { type: "EVENT_REJECTED", title: { contains: "retirado do ar" } } })).toBe(2);
  });
});

describe("autorização", () => {
  it("bloqueia quem não é ADMIN (e ADMIN suspenso)", async () => {
    const { event, owner } = await setup();
    await expect(approveEvent({ id: owner.id }, event.id)).rejects.toBeInstanceOf(AuthError);
    await expect(rejectEvent({ id: owner.id }, event.id, "Motivo qualquer com tamanho")).rejects.toBeInstanceOf(AuthError);
    const suspendedAdmin = await createUser({ role: "ADMIN", status: "SUSPENDED" });
    await expect(approveEvent({ id: suspendedAdmin.id }, event.id)).rejects.toBeInstanceOf(AuthError);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("PENDING_REVIEW");
  });
});

describe("denúncias", () => {
  async function withReports() {
    const ctx = await setup();
    const live = await createEvent(ctx.org.id, { title: "Show denunciado" });
    const r1 = await prisma.report.create({ data: { eventId: live.id, organizationId: ctx.org.id, reason: "FRAUD", details: "Pediram Pix antecipado" } });
    const r2 = await prisma.report.create({ data: { eventId: live.id, organizationId: ctx.org.id, reason: "WRONG_INFO" } });
    return { ...ctx, live, r1, r2 };
  }

  it("lista abertas com contagem do mesmo alvo", async () => {
    const { r1 } = await withReports();
    const list = await listReports("OPEN");
    expect(list.total).toBe(2);
    expect(list.counts.OPEN).toBe(2);
    expect(list.items.find((r) => r.id === r1.id)?.sameTargetOpen).toBe(2);
  });

  it("resolve despublicando o evento e encerra as denúncias do mesmo alvo", async () => {
    const { actor, r1, live } = await withReports();
    const res = await resolveReport(actor, r1.id, { resolution: "Golpe confirmado com o organizador", action: "unpublish", applyToSameTarget: true });
    expect(res.reportsClosed).toBe(2);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: live.id } })).status).toBe("REJECTED");
    expect(await prisma.report.count({ where: { status: "RESOLVED", resolvedById: actor.id } })).toBe(2);
    await expect(resolveReport(actor, r1.id, { resolution: "de novo", action: "none" })).rejects.toThrow(/já foi tratada/);
  });

  it("resolve suspendendo a organização (eventos saem do público)", async () => {
    const { actor, r1, live, org } = await withReports();
    await resolveReport(actor, r1.id, { resolution: "Organização fraudulenta", action: "suspend_org", applyToSameTarget: false });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).status).toBe("SUSPENDED");
    expect(await prisma.event.count({ where: { id: live.id, ...listedEventWhere() } })).toBe(0);
    expect(await prisma.report.count({ where: { status: "OPEN" } })).toBe(1);
  });

  it("descarta só a denúncia escolhida", async () => {
    const { actor, r2 } = await withReports();
    await dismissReport(actor, r2.id, { note: "Informações conferidas", applyToSameTarget: false });
    const after = await prisma.report.findUniqueOrThrow({ where: { id: r2.id } });
    expect(after.status).toBe("DISMISSED");
    expect(after.resolution).toBe("Informações conferidas");
    expect(await prisma.report.count({ where: { status: "OPEN" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "moderation.report_dismiss" } })).toBe(1);
  });
});

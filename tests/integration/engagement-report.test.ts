import { beforeEach, describe, expect, it } from "vitest";
import { ReportError, submitEventReport } from "@/server/engagement/report";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner.id);
  const event = await createEvent(org.id);
  return { owner, org, event };
}

async function expectReportError(p: Promise<unknown>, code: ReportError["code"]) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ReportError);
  expect((err as ReportError).code).toBe(code);
  return err as ReportError;
}

const anon = { userId: null, ip: "187.1.2.3" };

describe("denúncia de evento", () => {
  it("funciona sem login, guardando só o hash do IP", async () => {
    const { org, event } = await setup();
    const r = await submitEventReport({ eventId: event.id, reason: "WRONG_INFO", details: "  Horário errado  " }, anon);
    expect(r.duplicate).toBe(false);
    const row = await prisma.report.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ eventId: event.id, organizationId: org.id, reporterId: null, reason: "WRONG_INFO", details: "Horário errado", status: "OPEN" });
    expect(row.reporterIpHash).toMatch(/^[a-f0-9]{32}$/);
    expect(row.reporterIpHash).not.toContain("187.1.2.3");
    expect(await prisma.auditLog.count({ where: { action: "report.created", targetId: event.id } })).toBe(1);
  });

  it("com login, vincula a conta (sem hash de IP)", async () => {
    const { event } = await setup();
    const fan = await createUser();
    const r = await submitEventReport({ eventId: event.id, reason: "FRAUD" }, { userId: fan.id, ip: "10.0.0.1" });
    const row = await prisma.report.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.reporterId).toBe(fan.id);
    expect(row.reporterIpHash).toBeNull();
    expect(row.details).toBeNull();
  });

  it("valida motivo e detalhes", async () => {
    const { event } = await setup();
    let e = await expectReportError(submitEventReport({ eventId: event.id, reason: "QUALQUER" }, anon), "invalid");
    expect(e.fieldErrors?.reason).toBe("Escolha um motivo.");
    e = await expectReportError(submitEventReport({ eventId: event.id, reason: "OTHER", details: "" }, anon), "invalid");
    expect(e.fieldErrors?.details).toBeTruthy();
    e = await expectReportError(submitEventReport({ eventId: event.id, reason: "SPAM", details: "x".repeat(1001) }, anon), "invalid");
    expect(e.fieldErrors?.details).toContain("1000");
    await expectReportError(submitEventReport({ eventId: "", reason: "SPAM" }, anon), "invalid");
    await expectReportError(submitEventReport(null, anon), "invalid");
    expect(await prisma.report.count()).toBe(0);
  });

  it("não aceita evento sem página pública", async () => {
    const { org } = await setup();
    const draft = await createEvent(org.id, { status: "DRAFT" });
    await expectReportError(submitEventReport({ eventId: draft.id, reason: "SPAM" }, anon), "not_found");
    await expectReportError(submitEventReport({ eventId: "naoexiste", reason: "SPAM" }, anon), "not_found");
  });

  it("a mesma pessoa não duplica denúncias abertas (atualiza a existente)", async () => {
    const { event } = await setup();
    const a = await submitEventReport({ eventId: event.id, reason: "SPAM" }, anon);
    const b = await submitEventReport({ eventId: event.id, reason: "FRAUD", details: "Link de pagamento estranho" }, anon);
    expect(b).toEqual({ id: a.id, duplicate: true });
    expect(await prisma.report.count()).toBe(1);
    expect(await prisma.report.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ reason: "FRAUD", details: "Link de pagamento estranho" });
    // Outro visitante abre a própria denúncia.
    await submitEventReport({ eventId: event.id, reason: "SPAM" }, { userId: null, ip: "187.9.9.9" });
    expect(await prisma.report.count()).toBe(2);
  });

  it("limita a 10 denúncias por hora por visitante", async () => {
    const { org } = await setup();
    const events = await Promise.all(Array.from({ length: 11 }, () => createEvent(org.id)));
    for (const e of events.slice(0, 10)) await submitEventReport({ eventId: e.id, reason: "SPAM" }, anon);
    const err = await expectReportError(submitEventReport({ eventId: events[10].id, reason: "SPAM" }, anon), "rate_limited");
    expect(err.message).toMatch(/Tente novamente em \d+ min/);
    expect(await prisma.report.count()).toBe(10);
    // Outro IP continua podendo denunciar.
    await submitEventReport({ eventId: events[10].id, reason: "SPAM" }, { userId: null, ip: "8.8.4.4" });
    expect(await prisma.report.count()).toBe(11);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { PlanLimitError } from "@/server/billing/plans";
import {
  boostEvent,
  cancelEvent,
  createEvent as createEventService,
  deleteEvent,
  duplicateEvent,
  EventError,
  publishEvent,
  updateEvent,
  withdrawEvent,
} from "@/server/events/service";
import { eventStats, filterCounts, listOrgEvents, metricsCsv, orgOverview } from "@/server/events/organizer-queries";
import { setSetting } from "@/server/settings";
import { toLocalInputs } from "@/lib/dates";
import { BOOST_DURATION_DAYS } from "@/lib/plans";
import { emptyEventForm, eventDraftSchema, isUnsetDate, type EventData, type EventFormValues } from "@/lib/validation/event";
import { categoryId, createEvent, createOrg, createUser, prisma, resetDb, setPlan } from "../helpers";

const TZ = "America/Sao_Paulo";

function day(offset: number) {
  return toLocalInputs(new Date(Date.now() + offset * 86_400_000), TZ).date;
}

async function data(over: Partial<EventFormValues> = {}): Promise<EventData> {
  const values: EventFormValues = {
    ...emptyEventForm(),
    title: "Noite de samba",
    categoryId: await categoryId(),
    startDate: day(5),
    startTime: "20:00",
    endDate: day(5),
    endTime: "23:30",
    venueName: "Bar do Zé",
    address: "Rua Augusta, 100",
    city: "São Paulo",
    state: "SP",
    lat: -23.55,
    lng: -46.65,
    ...over,
  };
  return eventDraftSchema.parse(values);
}

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner.id, { name: "Casa do Samba" });
  return { owner, org };
}

beforeEach(async () => {
  await resetDb();
  await setSetting("moderation.mode", "none");
  await setSetting("publishing.requireVerifiedEmail", true);
});

describe("criação e edição com autorização", () => {
  it("cria rascunho com slug a partir do título", async () => {
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data());
    expect(e.status).toBe("DRAFT");
    expect(e.slug).toMatch(/^noite-de-samba-[a-z0-9]{5}$/);
    expect(e.createdById).toBe(owner.id);
  });

  it("rascunho sem datas nem local é aceito (datas ficam como não definidas)", async () => {
    const { owner, org } = await setup();
    const d = eventDraftSchema.parse({ ...emptyEventForm(), title: "Ideia de festa", categoryId: await categoryId() });
    const e = await createEventService(owner.id, org.id, d);
    expect(isUnsetDate(e.startsAt)).toBe(true);
    await expect(publishEvent(owner.id, e.id)).rejects.toMatchObject({ code: "INCOMPLETE" });
  });

  it("pessoa de outra organização não cria nem edita", async () => {
    const { owner, org } = await setup();
    const intruder = await createUser();
    await createOrg(intruder.id, { name: "Outra" });
    await expect(createEventService(intruder.id, org.id, await data())).rejects.toBeInstanceOf(AuthError);
    const e = await createEventService(owner.id, org.id, await data());
    await expect(updateEvent(intruder.id, e.id, await data({ title: "Hackeado" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(publishEvent(intruder.id, e.id)).rejects.toBeInstanceOf(EventError);
    await expect(deleteEvent(intruder.id, e.id)).rejects.toBeInstanceOf(EventError);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).title).toBe("Noite de samba");
  });

  it("EDITOR da equipe edita; local salvo de outra organização é ignorado", async () => {
    const { owner, org } = await setup();
    const editor = await createUser();
    await prisma.membership.create({ data: { organizationId: org.id, userId: editor.id, role: "EDITOR" } });
    const other = await createOrg((await createUser()).id);
    const foreignVenue = await prisma.venue.create({ data: { organizationId: other.id, name: "X", address: "Y", city: "Z", lat: 1, lng: 1 } });
    const e = await createEventService(owner.id, org.id, await data());
    const { event } = await updateEvent(editor.id, e.id, await data({ title: "Roda de samba", venueId: foreignVenue.id }));
    expect(event.title).toBe("Roda de samba");
    expect(event.venueId).toBeNull();
  });

  it("organização suspensa não edita", async () => {
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data());
    await prisma.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    await expect(updateEvent(owner.id, e.id, await data())).rejects.toBeInstanceOf(AuthError);
  });

  it("capa precisa ser um upload da própria organização", async () => {
    const { owner, org } = await setup();
    await expect(createEventService(owner.id, org.id, await data({ coverUrl: "https://evil.example/x.jpg" }))).rejects.toMatchObject({ code: "INVALID" });
    await prisma.upload.create({
      data: { key: "k1", url: "/media/orgs/x/cover.webp", thumbUrl: "/media/orgs/x/cover-thumb.webp", mimeType: "image/webp", width: 1600, height: 900, bytes: 1, purpose: "event-cover", organizationId: org.id, dominantColor: "#112233" },
    });
    const e = await createEventService(owner.id, org.id, await data({ coverUrl: "/media/orgs/x/cover.webp" }));
    expect(e.coverThumbUrl).toBe("/media/orgs/x/cover-thumb.webp");
    expect(e.coverColor).toBe("#112233");
  });
});

describe("publicação", () => {
  it("exige e-mail verificado quando a configuração está ligada", async () => {
    const owner = await createUser({ emailVerifiedAt: null });
    const org = await createOrg(owner.id);
    const e = await createEventService(owner.id, org.id, await data());
    await expect(publishEvent(owner.id, e.id)).rejects.toMatchObject({ code: "EMAIL_UNVERIFIED" });
    await setSetting("publishing.requireVerifiedEmail", false);
    expect((await publishEvent(owner.id, e.id)).status).toBe("PUBLISHED");
  });

  it("início no passado não publica", async () => {
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data({ startDate: day(-2), endDate: day(1) }));
    await expect(publishEvent(owner.id, e.id)).rejects.toMatchObject({ code: "INCOMPLETE", fieldErrors: { startDate: expect.stringMatching(/passado/) } });
  });

  it("respeita o limite de eventos ativos do plano", async () => {
    const { owner, org } = await setup();
    for (let i = 0; i < 3; i++) await createEvent(org.id, { title: `Ativo ${i}` });
    const e = await createEventService(owner.id, org.id, await data());
    await expect(publishEvent(owner.id, e.id)).rejects.toBeInstanceOf(PlanLimitError);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("DRAFT");
    await setPlan(org.id, "PRO");
    expect((await publishEvent(owner.id, e.id)).status).toBe("PUBLISHED");
  });

  it("modo 'none' publica direto, grava datas e avisa seguidores", async () => {
    const { owner, org } = await setup();
    const fan = await createUser();
    await prisma.follow.create({ data: { userId: fan.id, organizationId: org.id } });
    const e = await createEventService(owner.id, org.id, await data());
    const res = await publishEvent(owner.id, e.id);
    expect(res).toEqual({ status: "PUBLISHED", notified: 1 });
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(saved.publishedAt).toBeTruthy();
    expect(saved.submittedAt).toBeTruthy();
    expect(await prisma.notification.count({ where: { userId: fan.id, type: "NEW_EVENT_FROM_FOLLOWED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "event.publish", targetId: e.id } })).toBe(1);
  });

  it("modo 'all' sempre envia para análise (sem avisar seguidores)", async () => {
    await setSetting("moderation.mode", "all");
    const { owner, org } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { trustedPublisher: true } });
    const e = await createEventService(owner.id, org.id, await data());
    expect(await publishEvent(owner.id, e.id)).toEqual({ status: "PENDING_REVIEW", notified: 0 });
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(saved.publishedAt).toBeNull();
    expect(saved.submittedAt).toBeTruthy();
    await expect(publishEvent(owner.id, e.id)).rejects.toMatchObject({ code: "STATE" });
  });

  it("modo 'new_orgs': publica direto só com selo de confiança", async () => {
    await setSetting("moderation.mode", "new_orgs");
    const { owner, org } = await setup();
    const a = await createEventService(owner.id, org.id, await data());
    expect((await publishEvent(owner.id, a.id)).status).toBe("PENDING_REVIEW");
    await prisma.organization.update({ where: { id: org.id }, data: { trustedPublisher: true } });
    const b = await createEventService(owner.id, org.id, await data({ title: "Outro" }));
    expect((await publishEvent(owner.id, b.id)).status).toBe("PUBLISHED");
  });

  it("evento em análise conta no limite e pode ser retirado", async () => {
    await setSetting("moderation.mode", "all");
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data());
    await publishEvent(owner.id, e.id);
    await withdrawEvent(owner.id, e.id);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: e.id } })).status).toBe("DRAFT");
  });

  it("recusado pode ser editado e reenviado (limpa o motivo)", async () => {
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data());
    await prisma.event.update({ where: { id: e.id }, data: { status: "REJECTED", rejectionReason: "Imagem inadequada", reviewedAt: new Date() } });
    const { event } = await updateEvent(owner.id, e.id, await data({ title: "Noite de samba (nova capa)" }));
    expect(event.status).toBe("REJECTED");
    const res = await publishEvent(owner.id, e.id);
    expect(res.status).toBe("PUBLISHED");
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: e.id } });
    expect(saved.rejectionReason).toBeNull();
    expect(saved.reviewedAt).toBeNull();
  });
});

describe("edição de evento publicado", () => {
  it("continua publicado e avisa quem vai quando muda data ou local", async () => {
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data());
    await publishEvent(owner.id, e.id);
    const goer = await createUser();
    await prisma.eventRsvp.create({ data: { userId: goer.id, eventId: e.id, status: "GOING" } });

    const sameTime = await updateEvent(owner.id, e.id, await data({ description: "Com roda aberta" }));
    expect(sameTime.event.status).toBe("PUBLISHED");
    expect(sameTime.notified).toBe(0);

    const moved = await updateEvent(owner.id, e.id, await data({ description: "Com roda aberta", startTime: "21:00", endTime: "23:59" }));
    expect(moved.notified).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: goer.id, type: "EVENT_UPDATED" } });
    expect(n.body).toMatch(/Nova data/);

    const relocated = await updateEvent(owner.id, e.id, await data({ description: "Com roda aberta", startTime: "21:00", endTime: "23:59", venueName: "Quadra" }));
    expect(relocated.notified).toBe(1);
  });

  it("não pode ficar incompleto", async () => {
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data());
    await publishEvent(owner.id, e.id);
    await expect(updateEvent(owner.id, e.id, await data({ venueName: "", address: "" }))).rejects.toMatchObject({ code: "INCOMPLETE" });
  });

  it("evento acontecendo agora pode corrigir texto sem mexer no início", async () => {
    const { owner, org } = await setup();
    const startsAt = new Date(Date.now() - 3_600_000);
    const ev = await createEvent(org.id, { startsAt, endsAt: new Date(Date.now() + 3_600_000), title: "Agora" });
    const inputs = toLocalInputs(startsAt, TZ);
    const endInputs = toLocalInputs(new Date(Date.now() + 3_600_000), TZ);
    const d = await data({ title: "Agora (corrigido)", startDate: inputs.date, startTime: inputs.time, endDate: endInputs.date, endTime: endInputs.time });
    d.startsAt = startsAt;
    const { event } = await updateEvent(owner.id, ev.id, d);
    expect(event.title).toBe("Agora (corrigido)");
  });

  it("cancelado não pode ser editado", async () => {
    const { owner, org } = await setup();
    const ev = await createEvent(org.id, { status: "CANCELED" });
    await expect(updateEvent(owner.id, ev.id, await data())).rejects.toMatchObject({ code: "STATE" });
  });
});

describe("cancelamento, exclusão e duplicação", () => {
  it("cancela publicado e avisa quem marcou presença ou salvou", async () => {
    const { owner, org } = await setup();
    const ev = await createEvent(org.id);
    const goer = await createUser();
    const saver = await createUser();
    const stranger = await createUser();
    await prisma.eventRsvp.create({ data: { userId: goer.id, eventId: ev.id } });
    await prisma.eventSave.create({ data: { userId: saver.id, eventId: ev.id } });
    const res = await cancelEvent(owner.id, ev.id, "Chuva forte prevista");
    expect(res.notified).toBe(2);
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(saved.status).toBe("CANCELED");
    expect(saved.canceledAt).toBeTruthy();
    expect(await prisma.notification.count({ where: { type: "EVENT_CANCELED", userId: { in: [goer.id, saver.id] } } })).toBe(2);
    expect(await prisma.notification.count({ where: { userId: stranger.id } })).toBe(0);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "event.cancel", targetId: ev.id } });
    expect(log.metadata).toMatchObject({ reason: "Chuva forte prevista" });
    await expect(cancelEvent(owner.id, ev.id, null)).rejects.toMatchObject({ code: "STATE" });
  });

  it("rascunho não pode ser cancelado", async () => {
    const { owner, org } = await setup();
    const e = await createEventService(owner.id, org.id, await data());
    await expect(cancelEvent(owner.id, e.id, null)).rejects.toMatchObject({ code: "STATE" });
  });

  it("exclui só rascunho e recusado", async () => {
    const { owner, org } = await setup();
    const draft = await createEventService(owner.id, org.id, await data());
    const rejected = await createEvent(org.id, { status: "REJECTED" });
    const published = await createEvent(org.id);
    await deleteEvent(owner.id, draft.id);
    await deleteEvent(owner.id, rejected.id);
    await expect(deleteEvent(owner.id, published.id)).rejects.toMatchObject({ code: "STATE" });
    expect(await prisma.event.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "event.delete" } })).toBe(2);
  });

  it("duplica como rascunho sem datas e sem métricas", async () => {
    const { owner, org } = await setup();
    const ev = await createEvent(org.id, { title: "Feira de vinil", viewsCount: 50, tags: ["vinil"], featuredUntil: new Date(Date.now() + 86_400_000) });
    const copy = await duplicateEvent(owner.id, ev.id);
    expect(copy.status).toBe("DRAFT");
    expect(copy.title).toBe("Feira de vinil (cópia)");
    expect(copy.slug).not.toBe(ev.slug);
    expect(isUnsetDate(copy.startsAt) && isUnsetDate(copy.endsAt)).toBe(true);
    expect(copy.viewsCount).toBe(0);
    expect(copy.featuredUntil).toBeNull();
    expect(copy.tags).toEqual(["vinil"]);
    expect(copy.venueName).toBe(ev.venueName);
  });
});

describe("destaque", () => {
  it("plano gratuito não destaca", async () => {
    const { owner, org } = await setup();
    const ev = await createEvent(org.id);
    await expect(boostEvent(owner.id, ev.id)).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("Pro: cria destaque de 7 dias, respeita a cota mensal e o fim do evento", async () => {
    const { owner, org } = await setup();
    await setPlan(org.id, "PRO");
    const now = new Date();
    const long = await createEvent(org.id, { startsAt: new Date(now.getTime() + 86_400_000), endsAt: new Date(now.getTime() + 30 * 86_400_000) });
    const short = await createEvent(org.id, { startsAt: new Date(now.getTime() + 86_400_000), endsAt: new Date(now.getTime() + 2 * 86_400_000) });
    const third = await createEvent(org.id);

    const a = await boostEvent(owner.id, long.id, now);
    expect(a.featuredUntil.getTime()).toBe(now.getTime() + BOOST_DURATION_DAYS * 86_400_000);
    expect(a).toMatchObject({ used: 1, limit: 2 });
    await expect(boostEvent(owner.id, long.id, now)).rejects.toMatchObject({ code: "STATE" });

    const b = await boostEvent(owner.id, short.id, now);
    expect(b.featuredUntil.getTime()).toBe(short.endsAt.getTime());
    expect((await prisma.event.findUniqueOrThrow({ where: { id: short.id } })).featuredUntil?.getTime()).toBe(short.endsAt.getTime());

    await expect(boostEvent(owner.id, third.id, now)).rejects.toBeInstanceOf(PlanLimitError);
    expect(await prisma.eventBoost.count({ where: { organizationId: org.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "event.boost" } })).toBe(2);
  });

  it("só publicado e que ainda não terminou", async () => {
    const { owner, org } = await setup();
    await setPlan(org.id, "BUSINESS");
    const draft = await createEvent(org.id, { status: "DRAFT" });
    const past = await createEvent(org.id, { startsAt: new Date(Date.now() - 5 * 3_600_000), endsAt: new Date(Date.now() - 3_600_000) });
    await expect(boostEvent(owner.id, draft.id)).rejects.toMatchObject({ code: "STATE" });
    await expect(boostEvent(owner.id, past.id)).rejects.toMatchObject({ code: "STATE" });
  });
});

describe("consultas do painel", () => {
  it("lista com filtros e contagens; publicado que terminou aparece como encerrado", async () => {
    const { owner, org } = await setup();
    await createEventService(owner.id, org.id, await data({ title: "Rascunho A" }));
    await createEvent(org.id, { title: "No ar" });
    await createEvent(org.id, { title: "Já foi", startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 86_400_000) });
    await createEvent(org.id, { title: "Cancelado", status: "CANCELED" });
    await createEvent((await createOrg((await createUser()).id)).id, { title: "De outra organização" });

    const counts = await filterCounts(org.id);
    expect(counts).toMatchObject({ todos: 4, rascunho: 1, publicados: 1, encerrados: 1, cancelados: 1, analise: 0 });
    const ended = await listOrgEvents(org.id, { filter: "encerrados" });
    expect(ended.items.map((i) => [i.title, i.panelStatus])).toEqual([["Já foi", "ENDED"]]);
    const search = await listOrgEvents(org.id, { q: "rascu" });
    expect(search.items.map((i) => i.title)).toEqual(["Rascunho A"]);
    expect(search.items[0].startsAt).not.toBeNull();
    expect((await listOrgEvents(org.id)).total).toBe(4);
  });

  it("visão geral soma as métricas dos últimos 30 dias da organização", async () => {
    const { org } = await setup();
    const ev = await createEvent(org.id);
    const other = await createEvent((await createOrg((await createUser()).id)).id);
    const today = new Date(`${toLocalInputs(new Date(), TZ).date}T00:00:00.000Z`);
    const old = new Date(today.getTime() - 40 * 86_400_000);
    await prisma.eventMetricDaily.createMany({
      data: [
        { eventId: ev.id, day: today, views: 10, uniqueViews: 7, saves: 2, going: 1, ticketClicks: 3, shares: 1 },
        { eventId: ev.id, day: new Date(today.getTime() - 86_400_000), views: 5, uniqueViews: 5 },
        { eventId: ev.id, day: old, views: 100 },
        { eventId: other.id, day: today, views: 999 },
      ],
    });
    const o = await orgOverview(org.id);
    expect(o.kpis).toEqual({ views: 15, uniqueViews: 12, saves: 2, going: 1, ticketClicks: 3, shares: 1 });
    expect(o.previous.views).toBe(100);
    expect(o.usage).toMatchObject({ activeEvents: 1, boostsUsed: 0, plan: { tier: "FREE", maxActiveEvents: 3 } });
    expect(o.upcoming).toHaveLength(1);

    const s = await eventStats(org.id, ev.id);
    expect(s?.series).toHaveLength(30);
    expect(s?.series.at(-1)).toMatchObject({ views: 10, uniqueViews: 7 });
    expect(s?.last.views).toBe(15);
    expect(s?.allTime.views).toBe(115);
    expect(await eventStats(org.id, other.id)).toBeNull();
    const csv = metricsCsv(s!.series);
    expect(csv.split("\r\n")[0]).toBe("﻿data;visualizacoes;visitantes_unicos;salvamentos;vou;cliques_ingresso;compartilhamentos");
    expect(csv).toContain(";10;7;2;1;3;1");
  });
});

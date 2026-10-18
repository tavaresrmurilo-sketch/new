import { beforeEach, describe, expect, it } from "vitest";
import { setFollow, setRsvp, setSaved } from "@/server/engagement/service";
import { agendaCounts, availabilityOf, followedOrganizers, parseAgendaTab, pastEvents, upcomingRsvps, upcomingSaves } from "@/server/me/agenda";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

const H = 3_600_000;
const D = 24 * H;

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner.id, { name: "Coletivo QA" });
  const fan = await createUser();
  return { owner, org, fan };
}

describe("agenda: Vou", () => {
  it("lista GOING e INTERESTED futuros, por data, agrupados por dia — sem passados e sem os de outras pessoas", async () => {
    const { org, fan } = await setup();
    const other = await createUser();
    const now = new Date();
    const later = await createEvent(org.id, { title: "Depois", startsAt: new Date(now.getTime() + 5 * D) });
    const soon = await createEvent(org.id, { title: "Logo", startsAt: new Date(now.getTime() + 2 * D) });
    const sameDay = await createEvent(org.id, { title: "Mesmo dia", startsAt: new Date(now.getTime() + 2 * D + H) });
    const past = await createEvent(org.id, { title: "Passado", startsAt: new Date(now.getTime() - 3 * D) });
    await setRsvp(fan.id, later.id, "INTERESTED");
    await setRsvp(fan.id, soon.id, "GOING");
    await setRsvp(fan.id, sameDay.id, "GOING");
    await prisma.eventRsvp.create({ data: { userId: fan.id, eventId: past.id, status: "GOING" } });
    await setRsvp(other.id, later.id, "GOING");

    const groups = await upcomingRsvps(fan.id, now);
    const flat = groups.flatMap((g) => g.items);
    expect(flat.map((i) => i.event.title)).toEqual(["Logo", "Mesmo dia", "Depois"]);
    expect(flat.map((i) => i.rsvp)).toEqual(["GOING", "GOING", "INTERESTED"]);
    // "Logo" e "Mesmo dia" caem no mesmo dia, a menos que a 1 h os separe na virada do dia.
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(groups.length).toBeLessThanOrEqual(3);
    expect(flat.every((i) => i.availability === "ok")).toBe(true);
  });

  it("evento cancelado continua na agenda com aviso", async () => {
    const { org, fan } = await setup();
    const ev = await createEvent(org.id, { title: "Show cancelado" });
    await setRsvp(fan.id, ev.id, "GOING");
    await prisma.event.update({ where: { id: ev.id }, data: { status: "CANCELED", canceledAt: new Date() } });
    const flat = (await upcomingRsvps(fan.id)).flatMap((g) => g.items);
    expect(flat).toHaveLength(1);
    expect(flat[0].availability).toBe("canceled");
    expect(flat[0].status).toBe("CANCELED");
  });

  it("evento de organização suspensa ou despublicado aparece como indisponível", async () => {
    const { org, fan } = await setup();
    const a = await createEvent(org.id, { title: "A" });
    await setSaved(fan.id, a.id, true);
    await prisma.organization.update({ where: { id: org.id }, data: { status: "SUSPENDED" } });
    const flat = (await upcomingSaves(fan.id)).flatMap((g) => g.items);
    expect(flat[0].availability).toBe("unavailable");
    expect(availabilityOf({ status: "DRAFT", organization: { status: "ACTIVE" } })).toBe("unavailable");
    expect(availabilityOf({ status: "ARCHIVED", organization: { status: "ACTIVE" } })).toBe("ok");
  });
});

describe("agenda: Salvos, Histórico, Seguindo", () => {
  it("salvos só futuros e com o estado de presença", async () => {
    const { org, fan } = await setup();
    const now = new Date();
    const fut = await createEvent(org.id, { title: "Futuro" });
    const past = await createEvent(org.id, { title: "Passado", startsAt: new Date(now.getTime() - 2 * D) });
    await setSaved(fan.id, fut.id, true);
    await setSaved(fan.id, past.id, true);
    await setRsvp(fan.id, fut.id, "INTERESTED");
    const flat = (await upcomingSaves(fan.id, now)).flatMap((g) => g.items);
    expect(flat.map((i) => i.event.title)).toEqual(["Futuro"]);
    expect(flat[0]).toMatchObject({ saved: true, rsvp: "INTERESTED" });
  });

  it("histórico: passados com presença OU salvo, mais recentes primeiro, com paginação", async () => {
    const { org, fan } = await setup();
    const now = new Date();
    const old = await createEvent(org.id, { title: "Antigo", startsAt: new Date(now.getTime() - 20 * D) });
    const recent = await createEvent(org.id, { title: "Recente", startsAt: new Date(now.getTime() - 2 * D) });
    const notMine = await createEvent(org.id, { title: "Não marquei", startsAt: new Date(now.getTime() - 3 * D) });
    const future = await createEvent(org.id, { title: "Futuro" });
    await prisma.eventRsvp.create({ data: { userId: fan.id, eventId: old.id, status: "GOING" } });
    await prisma.eventSave.create({ data: { userId: fan.id, eventId: recent.id } });
    await setSaved(fan.id, future.id, true);
    void notMine;

    const page = await pastEvents(fan.id, { now });
    expect(page.items.map((i) => i.event.title)).toEqual(["Recente", "Antigo"]);
    expect(page.items[0]).toMatchObject({ saved: true, rsvp: null });
    expect(page.items[1]).toMatchObject({ saved: false, rsvp: "GOING" });
    expect(page.hasMore).toBe(false);

    const first = await pastEvents(fan.id, { now, take: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.hasMore).toBe(true);
  });

  it("seguindo: próximo evento listado de cada organizador e contagem, sem eventos de rascunho", async () => {
    const { owner, org, fan } = await setup();
    const org2 = await createOrg(owner.id, { name: "Casa Vazia" });
    const now = new Date();
    await createEvent(org.id, { title: "Segundo", startsAt: new Date(now.getTime() + 6 * D) });
    await createEvent(org.id, { title: "Primeiro", startsAt: new Date(now.getTime() + 1 * D) });
    await createEvent(org.id, { title: "Rascunho", status: "DRAFT", startsAt: new Date(now.getTime() + 2 * H) });
    await createEvent(org.id, { title: "Já foi", startsAt: new Date(now.getTime() - 3 * D) });
    await setFollow(fan.id, org.id, true);
    await setFollow(fan.id, org2.id, true);

    const list = await followedOrganizers(fan.id, now);
    expect(list).toHaveLength(2);
    const a = list.find((o) => o.id === org.id)!;
    expect(a.nextEvent?.title).toBe("Primeiro");
    expect(a.upcomingCount).toBe(2);
    const b = list.find((o) => o.id === org2.id)!;
    expect(b.nextEvent).toBeNull();
    expect(b.upcomingCount).toBe(0);

    const counts = await agendaCounts(fan.id, now);
    expect(counts).toEqual({ going: 0, saved: 0, following: 2 });
  });

  it("parseAgendaTab só aceita abas conhecidas", () => {
    expect(parseAgendaTab("historico")).toBe("historico");
    expect(parseAgendaTab(["seguindo"])).toBe("seguindo");
    expect(parseAgendaTab("<x>")).toBe("vou");
    expect(parseAgendaTab(undefined)).toBe("vou");
  });
});

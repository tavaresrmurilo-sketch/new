import { beforeEach, describe, expect, it } from "vitest";
import { EngagementError, engagementFor, setFollow, setRsvp, setSaved } from "@/server/engagement/service";
import { createEvent, createOrg, createUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

async function setup() {
  const owner = await createUser();
  const org = await createOrg(owner.id);
  const event = await createEvent(org.id);
  const fan = await createUser();
  return { owner, org, event, fan };
}

describe("salvar", () => {
  it("é idempotente e mantém o contador", async () => {
    const { event, fan } = await setup();
    expect((await setSaved(fan.id, event.id, true)).savesCount).toBe(1);
    expect((await setSaved(fan.id, event.id, true)).savesCount).toBe(1);
    expect((await setSaved(fan.id, event.id, false)).savesCount).toBe(0);
    expect((await setSaved(fan.id, event.id, false)).savesCount).toBe(0);
    const m = await prisma.eventMetricDaily.findMany({ where: { eventId: event.id } });
    expect(m[0].saves).toBe(1);
  });

  it("não permite salvar evento não publicado", async () => {
    const { org, fan } = await setup();
    const draft = await createEvent(org.id, { status: "DRAFT" });
    await expect(setSaved(fan.id, draft.id, true)).rejects.toBeInstanceOf(EngagementError);
  });
});

describe("vou / tenho interesse", () => {
  it("só GOING conta em goingCount", async () => {
    const { event, fan } = await setup();
    expect((await setRsvp(fan.id, event.id, "INTERESTED")).goingCount).toBe(0);
    expect((await setRsvp(fan.id, event.id, "GOING")).goingCount).toBe(1);
    expect((await setRsvp(fan.id, event.id, "GOING")).goingCount).toBe(1);
    expect((await setRsvp(fan.id, event.id, "INTERESTED")).goingCount).toBe(0);
    expect((await setRsvp(fan.id, event.id, "GOING")).goingCount).toBe(1);
    expect((await setRsvp(fan.id, event.id, null)).goingCount).toBe(0);
    expect(await prisma.eventRsvp.count()).toBe(0);
  });

  it("recusa evento encerrado", async () => {
    const { org, fan } = await setup();
    const past = await createEvent(org.id, { startsAt: new Date(Date.now() - 5 * 3600_000), endsAt: new Date(Date.now() - 3600_000) });
    await expect(setRsvp(fan.id, past.id, "GOING")).rejects.toThrow("já terminou");
  });
});

describe("seguir organizador e estado em lote", () => {
  it("segue, deixa de seguir e informa estado", async () => {
    const { org, event, fan } = await setup();
    expect((await setFollow(fan.id, org.id, true)).followers).toBe(1);
    expect((await setFollow(fan.id, org.id, true)).followers).toBe(1);
    expect((await setFollow(fan.id, org.id, false)).followers).toBe(0);
    await setSaved(fan.id, event.id, true);
    await setRsvp(fan.id, event.id, "GOING");
    const st = await engagementFor(fan.id, [event.id]);
    expect(st.saved.has(event.id)).toBe(true);
    expect(st.rsvp.get(event.id)).toBe("GOING");
  });
});

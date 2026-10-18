import { beforeEach, describe, expect, it } from "vitest";
import { AuthError } from "@/server/auth/guards";
import { PlanLimitError } from "@/server/billing/plans";
import { createVenue, deleteVenue, listVenues, updateVenue } from "@/server/organizations/venues";
import { venueSchema } from "@/lib/validation/organization";
import { createEvent, createOrg, createUser, prisma, resetDb, setPlan } from "../helpers";

beforeEach(resetDb);

function venue(name: string) {
  return venueSchema.parse({ name, address: "Rua da Aurora, 10", neighborhood: "Boa Vista", city: "Recife", state: "PE", postalCode: "50050000", lat: -8.06, lng: -34.88 });
}

describe("locais salvos", () => {
  it("cria, lista, edita e remove; CEP formatado", async () => {
    const u = await createUser();
    const org = await createOrg(u.id);
    const v = await createVenue(u.id, org.id, venue("Teatro do Parque"));
    expect(v.postalCode).toBe("50050-000");
    expect((await listVenues(org.id)).map((x) => [x.name, x.eventsCount])).toEqual([["Teatro do Parque", 0]]);
    const up = await updateVenue(u.id, v.id, venue("Teatro do Parque (palco 2)"));
    expect(up.name).toBe("Teatro do Parque (palco 2)");
    await deleteVenue(u.id, v.id);
    expect(await listVenues(org.id)).toHaveLength(0);
  });

  it("respeita o limite do plano (Gratuito: 2) e evita duplicados", async () => {
    const u = await createUser();
    const org = await createOrg(u.id);
    await createVenue(u.id, org.id, venue("Local 1"));
    await expect(createVenue(u.id, org.id, venue("local 1"))).rejects.toThrow(/já está salvo/);
    await createVenue(u.id, org.id, venue("Local 2"));
    await expect(createVenue(u.id, org.id, venue("Local 3"))).rejects.toBeInstanceOf(PlanLimitError);
    await setPlan(org.id, "PRO");
    await createVenue(u.id, org.id, venue("Local 3"));
    expect(await prisma.venue.count({ where: { organizationId: org.id } })).toBe(3);
  });

  it("outra organização não lê nem altera", async () => {
    const u = await createUser();
    const org = await createOrg(u.id);
    const v = await createVenue(u.id, org.id, venue("Meu local"));
    const intruder = await createUser();
    await createOrg(intruder.id);
    await expect(createVenue(intruder.id, org.id, venue("Invasão"))).rejects.toBeInstanceOf(AuthError);
    await expect(updateVenue(intruder.id, v.id, venue("Invasão"))).rejects.toBeInstanceOf(AuthError);
    await expect(deleteVenue(intruder.id, v.id)).rejects.toBeInstanceOf(AuthError);
  });

  it("remover um local mantém o endereço dos eventos", async () => {
    const u = await createUser();
    const org = await createOrg(u.id);
    const v = await createVenue(u.id, org.id, venue("Arena"));
    const ev = await createEvent(org.id, { venueId: v.id, venueName: "Arena" });
    expect((await listVenues(org.id))[0].eventsCount).toBe(1);
    await deleteVenue(u.id, v.id);
    const after = await prisma.event.findUniqueOrThrow({ where: { id: ev.id } });
    expect(after.venueId).toBeNull();
    expect(after.venueName).toBe("Arena");
  });

  it("valida coordenadas e campos obrigatórios", () => {
    expect(venueSchema.safeParse({ name: "X", address: "Rua", city: "Recife" }).success).toBe(false);
    expect(venueSchema.safeParse({ name: "Local", address: "Rua 1", city: "Recife", lat: 100, lng: 0 }).success).toBe(false);
  });
});

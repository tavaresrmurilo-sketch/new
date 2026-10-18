import "server-only";
import type { Venue } from "@prisma/client";
import { prisma } from "@/server/db";
import { assertOrgRole } from "@/server/auth/guards";
import { assertCanAddVenue } from "@/server/billing/plans";
import type { VenueData } from "@/lib/validation/organization";
import { OrgError } from "./service";

/** Locais salvos da organização (reutilizados no editor de eventos). */

export const VENUE_SELECT = {
  id: true,
  name: true,
  address: true,
  neighborhood: true,
  city: true,
  state: true,
  postalCode: true,
  lat: true,
  lng: true,
} as const;

export type VenueDTO = Pick<Venue, keyof typeof VENUE_SELECT>;

export async function listVenues(organizationId: string): Promise<(VenueDTO & { eventsCount: number })[]> {
  const rows = await prisma.venue.findMany({
    where: { organizationId },
    select: { ...VENUE_SELECT, _count: { select: { events: true } } },
    orderBy: [{ name: "asc" }],
    take: 500,
  });
  return rows.map(({ _count, ...v }) => ({ ...v, eventsCount: _count.events }));
}

export async function createVenue(userId: string, organizationId: string, data: VenueData): Promise<VenueDTO> {
  await assertOrgRole(userId, organizationId, "EDITOR");
  await assertCanAddVenue(organizationId);
  const duplicate = await prisma.venue.findFirst({
    where: { organizationId, name: { equals: data.name, mode: "insensitive" }, address: { equals: data.address, mode: "insensitive" } },
    select: { id: true },
  });
  if (duplicate) throw new OrgError("Este local já está salvo.", { name: "Já existe um local com este nome e endereço" });
  return prisma.venue.create({ data: { ...data, organizationId }, select: VENUE_SELECT });
}

async function ownVenue(userId: string, venueId: string) {
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true, organizationId: true } });
  if (!venue) throw new OrgError("Local não encontrado.");
  await assertOrgRole(userId, venue.organizationId, "EDITOR");
  return venue;
}

/** Alterar um local salvo não muda eventos já criados (eles guardam uma cópia do endereço). */
export async function updateVenue(userId: string, venueId: string, data: VenueData): Promise<VenueDTO> {
  await ownVenue(userId, venueId);
  return prisma.venue.update({ where: { id: venueId }, data, select: VENUE_SELECT });
}

export async function deleteVenue(userId: string, venueId: string): Promise<void> {
  await ownVenue(userId, venueId);
  await prisma.venue.delete({ where: { id: venueId } });
}

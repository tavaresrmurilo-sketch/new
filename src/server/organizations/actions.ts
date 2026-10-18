"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthError, assertUser } from "@/server/auth/guards";
import { PlanLimitError } from "@/server/billing/plans";
import { setCurrentOrg } from "@/server/organizations/current";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import type { ActionState } from "@/lib/action";
import { orgCreateSchema, orgUpdateSchema, venueSchema } from "@/lib/validation/organization";
import { fieldErrors } from "@/lib/validation/zod-errors";
import { createOrganization, OrgError, setOrganizationLogo, updateOrganization } from "./service";
import { createVenue, deleteVenue, updateVenue, type VenueDTO } from "./venues";

const idSchema = z.string().trim().min(1).max(64);
const INVALID: ActionState<never> = { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };

function form(fd: FormData) {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

function failure(err: unknown, scope: string): ActionState<never> {
  if (err instanceof OrgError) return { status: "error", message: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof PlanLimitError) return { status: "error", message: err.message, fieldErrors: { _code: "PLAN_LIMIT", _upgrade: err.upgradeTo ?? "" } };
  if (err instanceof AuthError) return { status: "error", message: err.message };
  console.error(`[org:${scope}]`, err);
  return { status: "error", message: "Não foi possível concluir agora. Tente de novo em instantes." };
}

async function actor(limit: "mutation" | "invite" = "mutation") {
  const user = await assertUser();
  const rl = await rateLimit(limit, `user:${user.id}`);
  if (!rl.allowed) throw new OrgError(retryMessage(rl.retryAfterSeconds));
  return user;
}

/** Onboarding: cria a organização, define como atual e segue para o passo do logo. */
export async function createOrganizationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const user = await assertUser();
    const rl = await rateLimit("invite", `org-create:${user.id}`);
    if (!rl.allowed) return { status: "error", message: retryMessage(rl.retryAfterSeconds) };
    const parsed = orgCreateSchema.safeParse(form(fd));
    if (!parsed.success) return { status: "error", message: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
    const org = await createOrganization(user.id, parsed.data);
    await setCurrentOrg(user.id, org.id);
    revalidatePath("/painel", "layout");
  } catch (err) {
    return failure(err, "create");
  }
  redirect("/painel/comecar/logo");
}

export async function updateOrganizationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = form(fd);
  const orgId = idSchema.safeParse(values.organizationId);
  if (!orgId.success) return INVALID;
  try {
    const user = await actor();
    const parsed = orgUpdateSchema.safeParse(values);
    if (!parsed.success) return { status: "error", message: "Revise os campos destacados.", fieldErrors: fieldErrors(parsed.error) };
    const org = await updateOrganization(user.id, orgId.data, parsed.data);
    revalidatePath("/painel", "layout");
    revalidatePath(`/organizador/${org.slug}`);
    return { status: "success", message: "Perfil da organização atualizado." };
  } catch (err) {
    return failure(err, "update");
  }
}

export async function setOrganizationLogoAction(organizationId: string, logoUrl: string | null): Promise<ActionState> {
  const parsed = z.object({ organizationId: idSchema, logoUrl: z.string().max(500).nullable() }).safeParse({ organizationId, logoUrl });
  if (!parsed.success) return INVALID;
  try {
    const user = await actor();
    await setOrganizationLogo(user.id, parsed.data.organizationId, parsed.data.logoUrl);
    revalidatePath("/painel", "layout");
    return { status: "success", message: parsed.data.logoUrl ? "Logo salvo." : "Logo removido." };
  } catch (err) {
    return failure(err, "logo");
  }
}

/** Troca a organização ativa do painel (valida a participação). */
export async function switchOrganizationAction(organizationId: string): Promise<ActionState> {
  const id = idSchema.safeParse(organizationId);
  if (!id.success) return INVALID;
  try {
    const user = await assertUser();
    const ok = await setCurrentOrg(user.id, id.data);
    if (!ok) return { status: "error", message: "Você não faz parte desta organização." };
    revalidatePath("/painel", "layout");
    return { status: "success" };
  } catch (err) {
    return failure(err, "switch");
  }
}

const venueInput = z.object({ organizationId: idSchema, values: z.record(z.string(), z.unknown()) });

export async function createVenueAction(input: unknown): Promise<ActionState<VenueDTO>> {
  const p = venueInput.safeParse(input);
  if (!p.success) return INVALID;
  try {
    const user = await actor();
    const parsed = venueSchema.safeParse(p.data.values);
    if (!parsed.success) return { status: "error", message: "Revise os dados do local.", fieldErrors: fieldErrors(parsed.error) };
    const venue = await createVenue(user.id, p.data.organizationId, parsed.data);
    revalidatePath("/painel/locais");
    return { status: "success", message: "Local salvo para os próximos eventos.", data: venue };
  } catch (err) {
    return failure(err, "venue-create");
  }
}

export async function updateVenueAction(venueId: string, values: unknown): Promise<ActionState<VenueDTO>> {
  const id = idSchema.safeParse(venueId);
  if (!id.success) return INVALID;
  try {
    const user = await actor();
    const parsed = venueSchema.safeParse(values);
    if (!parsed.success) return { status: "error", message: "Revise os dados do local.", fieldErrors: fieldErrors(parsed.error) };
    const venue = await updateVenue(user.id, id.data, parsed.data);
    revalidatePath("/painel/locais");
    return { status: "success", message: "Local atualizado.", data: venue };
  } catch (err) {
    return failure(err, "venue-update");
  }
}

export async function deleteVenueAction(venueId: string): Promise<ActionState> {
  const id = idSchema.safeParse(venueId);
  if (!id.success) return INVALID;
  try {
    const user = await actor();
    await deleteVenue(user.id, id.data);
    revalidatePath("/painel/locais");
    return { status: "success", message: "Local removido. Eventos que já usavam este endereço não mudam." };
  } catch (err) {
    return failure(err, "venue-delete");
  }
}

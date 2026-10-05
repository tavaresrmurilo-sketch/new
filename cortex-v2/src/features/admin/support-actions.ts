"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { toActionError, type ActionResult } from "@/server/action";
import { audit } from "@/server/audit";
import { getSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";

const enterSchema = z.object({ organizationId: z.string().min(1), reason: z.string().trim().min(5, "Informe o motivo do acesso (mín. 5 caracteres)").max(300) });

/** SUPER_ADMIN entra em um workspace em modo suporte (somente leitura, auditado). */
export async function enterSupportModeAction(input: z.input<typeof enterSchema>): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const session = await getSession();
    if (!session?.user.isSuperAdmin) throw new AppError("FORBIDDEN", "Acesso restrito ao administrador da plataforma.");
    const data = enterSchema.parse(input);
    const org = await prisma.organization.findUnique({ where: { id: data.organizationId }, select: { id: true, name: true } });
    if (!org) throw new AppError("NOT_FOUND", "Empresa não encontrada.");
    await prisma.session.update({ where: { id: session.id }, data: { supportOrganizationId: org.id, supportReason: data.reason } });
    await audit({ user: session.user, org, support: { reason: data.reason } }, "support.enter", { organizationId: org.id, metadata: { reason: data.reason } });
    return { ok: true, data: { redirectTo: "/app/dashboard" } };
  } catch (error) {
    return toActionError(error, "support.enter");
  }
}

export async function exitSupportModeAction(): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.supportOrganizationId) {
    await prisma.session.update({ where: { id: session.id }, data: { supportOrganizationId: null, supportReason: null } });
    await audit({ user: session.user, support: { reason: session.supportReason } }, "support.exit", { organizationId: session.supportOrganizationId });
  }
  return { ok: true, data: null };
}

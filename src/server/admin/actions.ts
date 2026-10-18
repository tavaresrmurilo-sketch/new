"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runJob } from "@/server/jobs";
import { JOB_INFO, isJobName } from "@/server/jobs/catalog";
import { audit } from "@/server/audit";
import type { ActionState } from "@/lib/action";
import { fieldErrors } from "@/lib/validation/zod-errors";
import { createCategory, updateCategory, updatePlan, updateSettings } from "./catalog";
import { actionFailure, adminActor, formValues, INVALID_REQUEST } from "./guard";
import { resendEmail } from "./ops";
import {
  changeOrganizationPlan,
  reactivateOrganization,
  setOrganizationTrusted,
  setOrganizationVerified,
  suspendOrganization,
} from "./organizations";
import { categoryCreateSchema, categoryFields, idSchema, planSchema, reasonSchema, settingsSchema } from "./schemas";
import { reactivateUser, suspendUser } from "./users";

const PLAN_TIERS = ["FREE", "PRO", "BUSINESS"] as const;
const REVIEW = "Revise os campos destacados.";

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function refreshAdmin(publicToo = false) {
  revalidatePath("/admin", "layout");
  if (publicToo) revalidatePath("/", "layout");
}

// ─────────────────────────────── Usuários

export async function suspendUserAction(userId: string, reason: string): Promise<ActionState> {
  const parsed = z.object({ id: idSchema, reason: reasonSchema(5, 500) }).safeParse({ id: userId, reason });
  if (!parsed.success) return { status: "error", message: "Informe o motivo da suspensão.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    const res = await suspendUser(actor, parsed.data.id, parsed.data.reason);
    refreshAdmin();
    const sessions = res.sessionsEnded === 0 ? "Não havia sessões abertas" : res.sessionsEnded === 1 ? "1 sessão encerrada" : `${res.sessionsEnded} sessões encerradas`;
    return { status: "success", message: `Conta suspensa. ${sessions}.` };
  } catch (err) {
    return actionFailure(err, "user-suspend");
  }
}

export async function reactivateUserAction(userId: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(userId);
  if (!parsed.success) return INVALID_REQUEST;
  try {
    const actor = await adminActor();
    await reactivateUser(actor, parsed.data);
    refreshAdmin();
    return { status: "success", message: "Conta reativada." };
  } catch (err) {
    return actionFailure(err, "user-reactivate");
  }
}

// ─────────────────────────────── Organizações

export async function setOrgFlagAction(organizationId: string, flag: "verified" | "trusted", value: boolean): Promise<ActionState> {
  const parsed = z.object({ id: idSchema, flag: z.enum(["verified", "trusted"]), value: z.boolean() }).safeParse({ id: organizationId, flag, value });
  if (!parsed.success) return INVALID_REQUEST;
  try {
    const actor = await adminActor();
    if (parsed.data.flag === "verified") await setOrganizationVerified(actor, parsed.data.id, parsed.data.value);
    else await setOrganizationTrusted(actor, parsed.data.id, parsed.data.value);
    refreshAdmin(parsed.data.flag === "verified");
    const msg =
      parsed.data.flag === "verified"
        ? parsed.data.value ? "Selo de verificada concedido." : "Selo de verificada removido."
        : parsed.data.value ? "Organização marcada como publicadora confiável." : "Publicação volta a passar pela análise.";
    return { status: "success", message: msg };
  } catch (err) {
    return actionFailure(err, "org-flag");
  }
}

export async function suspendOrgAction(organizationId: string, reason: string): Promise<ActionState> {
  const parsed = z.object({ id: idSchema, reason: reasonSchema(5, 500) }).safeParse({ id: organizationId, reason });
  if (!parsed.success) return { status: "error", message: "Informe o motivo da suspensão.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    await suspendOrganization(actor, parsed.data.id, parsed.data.reason);
    refreshAdmin(true);
    return { status: "success", message: "Organização suspensa. Os eventos saíram do ar." };
  } catch (err) {
    return actionFailure(err, "org-suspend");
  }
}

export async function reactivateOrgAction(organizationId: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(organizationId);
  if (!parsed.success) return INVALID_REQUEST;
  try {
    const actor = await adminActor();
    await reactivateOrganization(actor, parsed.data);
    refreshAdmin(true);
    return { status: "success", message: "Organização reativada." };
  } catch (err) {
    return actionFailure(err, "org-reactivate");
  }
}

export async function changeOrgPlanAction(organizationId: string, plan: string, reason: string): Promise<ActionState> {
  const parsed = z.object({ id: idSchema, plan: z.enum(PLAN_TIERS), reason: reasonSchema(5, 300) }).safeParse({ id: organizationId, plan, reason });
  if (!parsed.success) return { status: "error", message: "Escolha o plano e informe o motivo.", fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    const res = await changeOrganizationPlan(actor, parsed.data.id, parsed.data.plan, parsed.data.reason);
    refreshAdmin();
    return {
      status: "success",
      message: res.activeSubscription ? "Plano alterado. Atenção: há uma assinatura ativa no Stripe que pode sobrescrever esta mudança." : "Plano alterado.",
    };
  } catch (err) {
    return actionFailure(err, "org-plan");
  }
}

// ─────────────────────────────── Categorias, planos e configurações (formulários)

export async function saveCategoryAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const id = values.id ? idSchema.safeParse(values.id) : null;
  if (id && !id.success) return INVALID_REQUEST;
  const parsed = id ? categoryFields.safeParse(values) : categoryCreateSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: REVIEW, fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    if (id?.success) await updateCategory(actor, id.data, parsed.data);
    else await createCategory(actor, parsed.data as z.infer<typeof categoryCreateSchema>);
    refreshAdmin(true);
    return { status: "success", message: id ? "Categoria atualizada." : "Categoria criada." };
  } catch (err) {
    return actionFailure(err, "category");
  }
}

export async function savePlanAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const values = formValues(fd);
  const tier = z.enum(PLAN_TIERS).safeParse(values.tier);
  if (!tier.success) return INVALID_REQUEST;
  const parsed = planSchema.safeParse(values);
  if (!parsed.success) return { status: "error", message: REVIEW, fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    await updatePlan(actor, tier.data, parsed.data);
    refreshAdmin(true);
    return { status: "success", message: "Plano atualizado." };
  } catch (err) {
    return actionFailure(err, "plan");
  }
}

export async function saveSettingsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = settingsSchema.safeParse(formValues(fd));
  if (!parsed.success) return { status: "error", message: REVIEW, fieldErrors: fieldErrors(parsed.error) };
  try {
    const actor = await adminActor();
    await updateSettings(actor, parsed.data);
    refreshAdmin();
    return { status: "success", message: "Configurações salvas." };
  } catch (err) {
    return actionFailure(err, "settings");
  }
}

// ─────────────────────────────── E-mails e rotinas

export async function resendEmailAction(emailId: string): Promise<ActionState> {
  const parsed = idSchema.safeParse(emailId);
  if (!parsed.success) return INVALID_REQUEST;
  try {
    const actor = await adminActor();
    const res = await resendEmail(actor, parsed.data);
    refreshAdmin();
    if (res.status === "SENT") return { status: "success", message: "E-mail reenviado." };
    if (res.status === "SKIPPED") return { status: "error", message: "Nenhum provedor de e-mail configurado: a nova tentativa ficou como não enviada." };
    return { status: "error", message: "O provedor recusou o envio de novo. Veja o erro no registro mais recente." };
  } catch (err) {
    return actionFailure(err, "email-resend");
  }
}

export async function runJobAction(job: string): Promise<ActionState> {
  if (!isJobName(job)) return INVALID_REQUEST;
  try {
    const actor = await adminActor();
    const run = await runJob(job, { trigger: "manual", actorId: actor.id });
    await audit({ actorId: actor.id, action: "admin.job.run", targetType: "JobRun", targetId: run.id, metadata: { job, status: run.status, durationMs: run.durationMs }, ip: actor.ip });
    refreshAdmin(true);
    return run.status === "success"
      ? { status: "success", message: `${JOB_INFO[job].label} concluída em ${formatDuration(run.durationMs)}.` }
      : { status: "error", message: `${JOB_INFO[job].label} terminou com erro. Veja os detalhes no histórico.` };
  } catch (err) {
    return actionFailure(err, "job-run");
  }
}

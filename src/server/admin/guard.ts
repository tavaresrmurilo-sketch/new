import "server-only";
import { AuthError, assertAdmin } from "@/server/auth/guards";
import { requestMeta } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import type { ActionState } from "@/lib/action";
import { AdminError, type AdminActor } from "./common";

/** Server Actions do /admin: exige ADMIN, aplica limite de taxa e captura o IP para a auditoria. */
export async function adminActor(): Promise<AdminActor> {
  const user = await assertAdmin();
  const rl = await rateLimit("mutation", `admin:${user.id}`);
  if (!rl.allowed) throw new AdminError(retryMessage(rl.retryAfterSeconds));
  const { ip } = await requestMeta();
  return { id: user.id, ip };
}

export const INVALID_REQUEST: ActionState<never> = { status: "error", message: "Pedido inválido. Atualize a página e tente de novo." };

export function actionFailure(err: unknown, scope: string): ActionState<never> {
  if (err instanceof AdminError) return { status: "error", message: err.message, fieldErrors: err.fieldErrors };
  if (err instanceof AuthError) return { status: "error", message: err.message };
  console.error(`[admin:${scope}]`, err);
  return { status: "error", message: "Não foi possível concluir agora. Tente de novo em instantes." };
}

export function formValues(fd: FormData): Record<string, string> {
  return Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
}

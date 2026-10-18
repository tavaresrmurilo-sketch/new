import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { destroySession, getSessionUser } from "@/server/auth/session";
import { AccountDeletionBlocked, deleteAccount } from "@/server/me/account";
import { deleteAccountSchema } from "@/server/me/schemas";
import { MeError } from "@/server/me/service";
import { isSameOrigin, requestMetaFrom } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/me/delete { password? , confirm? } — exclusão da própria conta (LGPD).
 * É um Route Handler (e não uma Server Action) para encerrar a sessão sem
 * re-renderizar a página protegida de origem. Resposta no formato ActionState.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ status: "error", message: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ status: "error", message: "Entre na sua conta para continuar." }, { status: 401 });

  // Mesmo limite do login (tentativas de senha), em balde próprio.
  const rl = await rateLimit("accountDelete", user.id);
  if (!rl.allowed) return NextResponse.json({ status: "error", message: retryMessage(rl.retryAfterSeconds) }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Pedido inválido." }, { status: 400 });
  }
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ status: "error", message: "Pedido inválido." }, { status: 422 });

  const meta = requestMetaFrom(req);
  try {
    const summary = await deleteAccount(user.id, parsed.data);
    await audit({ actorId: user.id, action: "user.account_deleted", targetType: "User", targetId: user.id, metadata: summary, ip: meta.ip });
  } catch (err) {
    if (err instanceof AccountDeletionBlocked) {
      await audit({
        actorId: user.id,
        action: "user.account_delete_blocked",
        targetType: "User",
        targetId: user.id,
        metadata: { organizations: err.organizations.map((o) => o.id) },
        ip: meta.ip,
      });
      return NextResponse.json({ status: "error", message: err.message, fieldErrors: { blocked: "sole_owner" } }, { status: 409 });
    }
    if (err instanceof MeError) return NextResponse.json({ status: "error", message: err.message, fieldErrors: err.fieldErrors }, { status: 422 });
    console.error("[me:delete]", err);
    return NextResponse.json({ status: "error", message: "Não foi possível excluir a conta agora. Tente de novo em instantes." }, { status: 500 });
  }

  await destroySession();
  return NextResponse.json({ status: "success", message: "Sua conta foi excluída." });
}

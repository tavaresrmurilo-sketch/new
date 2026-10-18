import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { removePushSubscription } from "@/server/me/push";
import { pushUnsubscribeSchema } from "@/server/me/schemas";
import { isSameOrigin } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/push/unsubscribe { endpoint } — desativa push neste navegador (só a própria inscrição). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para continuar." }, { status: 401 });

  const rl = await rateLimit("mutation", `push:${user.id}`);
  if (!rl.allowed) return NextResponse.json({ error: retryMessage(rl.retryAfterSeconds) }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const parsed = pushUnsubscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 422 });

  const removed = await removePushSubscription(user.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true, removed });
}

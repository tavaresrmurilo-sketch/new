import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { savePushSubscription } from "@/server/me/push";
import { pushSubscriptionSchema } from "@/server/me/schemas";
import { isSameOrigin, requestMetaFrom } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/push/subscribe { endpoint, keys: { p256dh, auth } } — ativa push neste navegador. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para ativar as notificações." }, { status: 401 });

  const rl = await rateLimit("mutation", `push:${user.id}`);
  if (!rl.allowed) return NextResponse.json({ error: retryMessage(rl.retryAfterSeconds) }, { status: 429 });

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 4096) return NextResponse.json({ error: "Pedido muito grande." }, { status: 413 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Inscrição de push inválida." }, { status: 422 });

  await savePushSubscription(user.id, parsed.data, requestMetaFrom(req).userAgent);
  return NextResponse.json({ ok: true });
}

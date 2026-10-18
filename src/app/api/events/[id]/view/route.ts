import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { recordView } from "@/server/engagement/tracking";
import { isSameOrigin, requestMetaFrom } from "@/server/request";
import { ipHash } from "@/server/security/crypto";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9]{1,64}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

/** Registra a visualização da página do evento (disparado pelo ViewTracker após ~1 s). */
export async function POST(req: Request, ctx: RouteContext<"/api/events/[id]/view">) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403, headers: NO_STORE });
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404, headers: NO_STORE });

  const meta = requestMetaFrom(req);
  const rl = await rateLimit("engagement", `ip:${ipHash(meta.ip) ?? "unknown"}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: retryMessage(rl.retryAfterSeconds) },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const user = await getSessionUser();
  const result = await recordView(id, { ...meta, viewerId: user?.id ?? null });
  if (!result.counted && result.reason === "not_found") {
    return NextResponse.json({ error: "Evento não encontrado." }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, counted: result.counted }, { headers: NO_STORE });
}

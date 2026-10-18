import { NextResponse } from "next/server";
import { recordShare } from "@/server/engagement/tracking";
import { isSameOrigin, requestMetaFrom } from "@/server/request";
import { ipHash } from "@/server/security/crypto";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9]{1,64}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

/** Registra um compartilhamento (Web Share, copiar link, WhatsApp…). */
export async function POST(req: Request, ctx: RouteContext<"/api/events/[id]/share">) {
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

  const result = await recordShare(id, meta);
  if (!result.found) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ok: true, counted: result.counted }, { headers: NO_STORE });
}

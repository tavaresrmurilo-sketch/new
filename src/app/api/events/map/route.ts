import { NextResponse } from "next/server";
import { ExploreQueryError, parseExploreQuery, searchMapPoints } from "@/server/events/search";
import { requestMetaFrom } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/events/map?bbox=w,s,e,n&q&cat&quando&gratis&acessivel
 * → { points: [{ id, slug, lat, lng, cat, icon, color, featured, live, title, startsAt, endsAt, timezone }], total, truncated }
 * Até 3000 pontos (destaques primeiro, depois por data). Sem bbox, a consulta é global (ex.: ajustar o mapa a uma busca).
 */
export async function GET(req: Request) {
  const meta = requestMetaFrom(req);
  const rl = await rateLimit("publicApi", meta.ip ?? "unknown");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: retryMessage(rl.retryAfterSeconds) },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }

  let parsed;
  try {
    parsed = parseExploreQuery(new URL(req.url).searchParams);
  } catch (err) {
    if (err instanceof ExploreQueryError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  try {
    const result = await searchMapPoints({ filters: parsed.filters, bbox: parsed.bbox });
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=20, s-maxage=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[api/events/map]", err);
    return NextResponse.json({ error: "Não foi possível carregar o mapa agora." }, { status: 500 });
  }
}

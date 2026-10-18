import { NextResponse } from "next/server";
import {
  eventCardsByIds,
  ExploreQueryError,
  InvalidCursorError,
  parseExploreQuery,
  searchEventList,
} from "@/server/events/search";
import { requestMetaFrom } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/events?bbox=w,s,e,n&near=lat,lng&ordem&cursor&q&cat&quando&gratis&acessivel
 * → { items: EventCardData[], nextCursor, total } — 20 por página.
 * GET /api/events?ids=a,b,c → { items, nextCursor: null, total } (cards específicos, até 50).
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
    if (parsed.ids) {
      const items = await eventCardsByIds(parsed.ids, { near: parsed.near });
      return NextResponse.json(
        { items, nextCursor: null, total: items.length },
        { headers: { "cache-control": "public, max-age=30, s-maxage=30, stale-while-revalidate=60" } },
      );
    }
    const result = await searchEventList({
      filters: parsed.filters,
      bbox: parsed.bbox,
      near: parsed.near,
      cursor: parsed.cursor,
    });
    return NextResponse.json(result, {
      headers: { "cache-control": "public, max-age=15, s-maxage=20, stale-while-revalidate=60" },
    });
  } catch (err) {
    if (err instanceof InvalidCursorError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[api/events]", err);
    return NextResponse.json({ error: "Não foi possível carregar os eventos agora." }, { status: 500 });
  }
}

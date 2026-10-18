import { NextResponse } from "next/server";
import { z } from "zod";
import { suggest } from "@/server/events/search";
import { requestMetaFrom } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const schema = z.object({ q: z.string().trim().max(80, { error: "Busca muito longa." }) });

/**
 * GET /api/search/suggest?q=sam → { events: [...5], organizers: [...5], categories: [...] }
 * Cidades e endereços vêm de /api/geocode (que pode estar indisponível).
 */
export async function GET(req: Request) {
  const parsed = schema.safeParse({ q: new URL(req.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Busca inválida." }, { status: 400 });
  const q = parsed.data.q;
  if (q.length < 2) return NextResponse.json({ events: [], organizers: [], categories: [] });

  const meta = requestMetaFrom(req);
  const rl = await rateLimit("publicApi", meta.ip ?? "unknown");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: retryMessage(rl.retryAfterSeconds) },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }

  try {
    const result = await suggest(q);
    return NextResponse.json(result, { headers: { "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120" } });
  } catch (err) {
    console.error("[api/search/suggest]", err);
    return NextResponse.json({ error: "Não foi possível buscar sugestões agora." }, { status: 500 });
  }
}

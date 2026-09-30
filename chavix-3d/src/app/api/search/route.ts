import { NextResponse, type NextRequest } from "next/server";
import { instantSearch } from "@/lib/catalog";
import { clientIpFrom } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  if (q.trim().length < 2) return NextResponse.json({ products: [], categories: [] });
  const limit = await rateLimit(`search:${clientIpFrom(request.headers)}`, 120, 60);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  return NextResponse.json(await instantSearch(q), { headers: { "Cache-Control": "no-store" } });
}

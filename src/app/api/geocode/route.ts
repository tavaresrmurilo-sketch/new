import { NextResponse } from "next/server";
import { GeocoderUnavailable, geocodeSearch } from "@/server/geocode";
import { requestMetaFrom } from "@/server/request";
import { rateLimit } from "@/server/security/rate-limit";
import { isValidLatLng } from "@/lib/geo";

export const dynamic = "force-dynamic";

/** GET /api/geocode?q=Rua+Augusta&lat=-23.5&lng=-46.6 → { results: GeoResult[] } */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });
  const meta = requestMetaFrom(req);
  const rl = await rateLimit("geocode", meta.ip ?? "unknown");
  if (!rl.allowed) return NextResponse.json({ error: "Muitas buscas seguidas. Aguarde um instante." }, { status: 429 });
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const near = url.searchParams.has("lat") && isValidLatLng(lat, lng) ? { lat, lng } : null;
  try {
    const results = await geocodeSearch(q, near);
    return NextResponse.json({ results }, { headers: { "cache-control": "private, max-age=300" } });
  } catch (err) {
    if (err instanceof GeocoderUnavailable) return NextResponse.json({ error: err.message, results: [] }, { status: 503 });
    console.error("[geocode]", err);
    return NextResponse.json({ error: "Falha na busca de endereços.", results: [] }, { status: 500 });
  }
}

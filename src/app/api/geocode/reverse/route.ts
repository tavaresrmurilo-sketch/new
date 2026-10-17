import { NextResponse } from "next/server";
import { GeocoderUnavailable, reverseGeocode } from "@/server/geocode";
import { requestMetaFrom } from "@/server/request";
import { rateLimit } from "@/server/security/rate-limit";
import { isValidLatLng } from "@/lib/geo";

export const dynamic = "force-dynamic";

/** GET /api/geocode/reverse?lat=..&lng=.. → { result: GeoResult | null } */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!isValidLatLng(lat, lng)) return NextResponse.json({ error: "Coordenadas inválidas." }, { status: 400 });
  const rl = await rateLimit("geocode", requestMetaFrom(req).ip ?? "unknown");
  if (!rl.allowed) return NextResponse.json({ error: "Muitas buscas seguidas. Aguarde um instante." }, { status: 429 });
  try {
    return NextResponse.json({ result: await reverseGeocode(lat, lng) });
  } catch (err) {
    if (err instanceof GeocoderUnavailable) return NextResponse.json({ error: err.message, result: null }, { status: 503 });
    console.error("[geocode:reverse]", err);
    return NextResponse.json({ error: "Falha ao identificar o endereço.", result: null }, { status: 500 });
  }
}

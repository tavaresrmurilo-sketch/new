import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { appUrl, env } from "@/server/env";
import { sha256 } from "@/server/security/crypto";

export interface GeoResult {
  label: string;
  name: string | null;
  address: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  kind: "place" | "address" | "city" | "region";
}

export class GeocoderUnavailable extends Error {}

const CACHE_TTL_MS = 30 * 86_400_000;

// Política de uso do Nominatim público: no máximo 1 requisição por segundo.
let queue: Promise<unknown> = Promise.resolve();
let last = 0;
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, last + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  addresstype?: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
}

function uf(address: Record<string, string> | undefined): string | null {
  const iso = address?.["ISO3166-2-lvl4"];
  if (iso && /^BR-[A-Z]{2}$/.test(iso)) return iso.slice(3);
  return address?.state ?? null;
}

function mapItem(it: NominatimItem): GeoResult {
  const a = it.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.city_district ?? null;
  const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(", ");
  const neighborhood = a.suburb ?? a.neighbourhood ?? a.quarter ?? null;
  const kindRaw = it.addresstype ?? it.type ?? "";
  const kind: GeoResult["kind"] = ["city", "town", "village", "municipality"].includes(kindRaw)
    ? "city"
    : ["state", "region", "country"].includes(kindRaw)
      ? "region"
      : street
        ? "address"
        : "place";
  const name = it.name && it.name !== street && it.name !== city ? it.name : null;
  const address = street || it.display_name.split(",").slice(0, 2).join(",").trim();
  const state = uf(a);
  const label = [name, address, neighborhood, city && state ? `${city} – ${state}` : city ?? state].filter(Boolean).join(" · ");
  return {
    label: label || it.display_name,
    name,
    address,
    neighborhood,
    city,
    state,
    postalCode: a.postcode ?? null,
    lat: Number(it.lat),
    lng: Number(it.lon),
    kind,
  };
}

async function nominatim(path: string, params: Record<string, string>): Promise<unknown> {
  const e = env();
  if (e.GEOCODER === "none") throw new GeocoderUnavailable("Busca de endereços desativada (GEOCODER=none).");
  const url = new URL(path, e.NOMINATIM_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pt-BR");
  if (e.GEOCODER_CONTACT_EMAIL) url.searchParams.set("email", e.GEOCODER_CONTACT_EMAIL);
  return throttled(async () => {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "user-agent": `Mixtour/1.0 (+${appUrl()})`, accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (err) {
      throw new GeocoderUnavailable(`Serviço de endereços indisponível: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) throw new GeocoderUnavailable(`Serviço de endereços respondeu ${res.status}.`);
    return res.json();
  });
}

async function cached<T>(kind: string, query: string, compute: () => Promise<T>): Promise<T> {
  const queryHash = sha256(`${kind}:${query}`);
  const hit = await prisma.geocodeCache.findUnique({ where: { queryHash } });
  if (hit && Date.now() - hit.createdAt.getTime() < CACHE_TTL_MS) return hit.result as T;
  const result = await compute();
  await prisma.geocodeCache.upsert({
    where: { queryHash },
    create: { queryHash, kind, query: query.slice(0, 300), result: result as Prisma.InputJsonValue },
    update: { result: result as Prisma.InputJsonValue, createdAt: new Date() },
  });
  return result;
}

export async function geocodeSearch(q: string, near?: { lat: number; lng: number } | null): Promise<GeoResult[]> {
  const query = q.trim().slice(0, 200);
  if (query.length < 3) return [];
  const params: Record<string, string> = { q: query, limit: "6", countrycodes: env().GEOCODER_COUNTRY_CODES };
  let key = query.toLowerCase();
  if (near) {
    // Prioriza resultados próximos (viewbox de ~1,5° sem restringir).
    const d = 0.75;
    params.viewbox = `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
    key += `@${near.lat.toFixed(1)},${near.lng.toFixed(1)}`;
  }
  return cached("search", key, async () => {
    const items = (await nominatim("/search", params)) as NominatimItem[];
    return Array.isArray(items) ? items.map(mapItem).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)) : [];
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  return cached("reverse", key, async () => {
    const item = (await nominatim("/reverse", { lat: String(lat), lon: String(lng), zoom: "18" })) as NominatimItem & { error?: string };
    if (!item || item.error) return null;
    return mapItem(item);
  });
}

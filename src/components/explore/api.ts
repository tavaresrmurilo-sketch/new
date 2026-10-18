/**
 * Cliente das APIs públicas da tela Explorar, com cache em memória por URL
 * (as respostas não dependem do usuário) e erros com mensagem em pt-BR.
 */
import type { PinPoint } from "@/components/map/markers";
import type { EventCardData } from "@/lib/events";

export interface MapPointsResponse {
  points: PinPoint[];
  total: number;
  truncated: boolean;
}

export interface EventListResponse {
  items: EventCardData[];
  nextCursor: string | null;
  total: number;
}

export interface SuggestResponse {
  events: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    place: string;
    category: { slug: string; name: string; icon: string; color: string };
  }[];
  organizers: { id: string; slug: string; name: string; logoUrl: string | null; verified: boolean; city: string | null; state: string | null; upcomingCount: number }[];
  categories: { slug: string; name: string; icon: string; color: string }[];
}

export interface GeoPlace {
  label: string;
  name: string | null;
  address: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
  kind: "place" | "address" | "city" | "region";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 80;
const cache = new Map<string, { at: number; data: unknown }>();

export function cachedJson<T>(url: string): T | undefined {
  const hit = cache.get(url);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(url);
    return undefined;
  }
  return hit.data as T;
}

export function primeCache(url: string, data: unknown) {
  cache.set(url, { at: Date.now(), data });
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const hit = cachedJson<T>(url);
  if (hit !== undefined) return hit;
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { accept: "application/json" } });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiError(0, "Sem conexão. Verifique sua internet e tente de novo.");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const fallback = res.status === 429 ? "Muitas buscas seguidas. Aguarde um instante." : "Não foi possível carregar agora.";
    throw new ApiError(res.status, body?.error ?? fallback);
  }
  const data = (await res.json()) as T;
  cache.set(url, { at: Date.now(), data });
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return data;
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Algo deu errado. Tente de novo.";
}

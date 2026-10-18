"use client";

/**
 * Conveniências por visitante guardadas no navegador (podem faltar: aba
 * anônima, armazenamento bloqueado). Tudo protegido por try/catch.
 */
import { useSyncExternalStore } from "react";
import { MAX_ZOOM, MIN_ZOOM, normalizeQuery, type MapView } from "@/lib/explore-params";

const VIEW_KEY = "mx:explore:view:v1";
const RECENT_KEY = "mx:explore:recent:v1";
const AUTO_KEY = "mx:explore:auto-update:v1";
const MAX_RECENT = 8;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // armazenamento indisponível: segue sem lembrar
  }
}

/** Última vista do mapa (para reabrir onde a pessoa parou). */
export function readStoredView(): MapView | null {
  if (typeof window === "undefined") return null;
  const raw = read(VIEW_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<MapView>;
    if (typeof v.lat !== "number" || typeof v.lng !== "number" || typeof v.zoom !== "number") return null;
    if (Math.abs(v.lat) > 85 || Math.abs(v.lng) > 180) return null;
    return { lat: v.lat, lng: v.lng, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom)) };
  } catch {
    return null;
  }
}

export function storeView(view: MapView) {
  write(VIEW_KEY, JSON.stringify({ lat: +view.lat.toFixed(5), lng: +view.lng.toFixed(5), zoom: +view.zoom.toFixed(2) }));
}

// ───────── buscas recentes (com assinatura para atualizar a interface) ─────────

const listeners = new Set<() => void>();
let recentCache: string[] | null = null;

function loadRecent(): string[] {
  if (recentCache) return recentCache;
  try {
    const parsed = JSON.parse(read(RECENT_KEY) ?? "[]") as unknown;
    recentCache = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").map(normalizeQuery).filter(Boolean).slice(0, MAX_RECENT) : [];
  } catch {
    recentCache = [];
  }
  return recentCache;
}

function saveRecent(list: string[]) {
  recentCache = list;
  write(RECENT_KEY, JSON.stringify(list));
  for (const l of listeners) l();
}

export function addRecentSearch(q: string) {
  const v = normalizeQuery(q);
  if (v.length < 2) return;
  const lower = v.toLowerCase();
  saveRecent([v, ...loadRecent().filter((s) => s.toLowerCase() !== lower)].slice(0, MAX_RECENT));
}

export function removeRecentSearch(q: string) {
  saveRecent(loadRecent().filter((s) => s !== q));
}

export function clearRecentSearches() {
  saveRecent([]);
}

const EMPTY: string[] = [];

export function useRecentSearches(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    loadRecent,
    () => EMPTY,
  );
}

// ───────── preferência "atualizar lista ao mover o mapa" ─────────

const autoListeners = new Set<() => void>();

/** Preferência do desktop "Atualizar lista ao mover o mapa" (ligada por padrão). */
export function useAutoUpdatePreference(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      autoListeners.add(cb);
      return () => autoListeners.delete(cb);
    },
    () => read(AUTO_KEY) !== "0",
    () => true,
  );
  const set = (v: boolean) => {
    write(AUTO_KEY, v ? null : "0");
    for (const l of autoListeners) l();
  };
  return [value, set];
}

// ───────── media query ─────────

const DESKTOP_QUERY = "(min-width: 1024px)";

/** true no desktop (≥ 1024 px), false no celular, null durante a renderização no servidor/hidratação. */
export function useIsDesktop(): boolean | null {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(DESKTOP_QUERY);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null,
  );
}

// ───────── suporte a WebGL (o MapLibre precisa dele) ─────────

let webgl: boolean | null = null;

function detectWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const ctx = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    webgl = Boolean(ctx);
    ctx?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

const noopSubscribe = () => () => {};

/** false quando o navegador não consegue abrir o mapa (sem WebGL). */
export function useWebGLSupport(): boolean {
  return useSyncExternalStore(noopSubscribe, detectWebGL, () => true);
}

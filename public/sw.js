/* Mixtour — service worker (PWA).
 *
 * - Cache somente de arquivos estáticos e públicos: /_next/static (JS, CSS e fontes
 *   com hash no nome), /icons e /icon.svg. Estratégia "cache primeiro".
 * - Navegações: sempre pela rede (nunca guardamos HTML, que pode ser autenticado);
 *   sem conexão, mostra a página /offline.
 * - Nunca intercepta /api, /painel, /admin, /perfil nem respostas de outras origens.
 * - Push: exibe a notificação e, ao tocar, abre/foca a URL interna.
 */

const VERSION = "mx-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_CACHE = `${VERSION}-offline`;
const OFFLINE_URL = "/offline";
const PRECACHE = ["/icons/icon-192.png", "/icons/badge-96.png", "/icon.svg"];
const MAX_STATIC_ENTRIES = 250;

const PRIVATE_PREFIXES = ["/api/", "/painel", "/admin", "/perfil", "/salvos", "/notificacoes", "/entrar", "/cadastrar", "/media/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const offline = await caches.open(OFFLINE_CACHE);
      const res = await fetch(new Request(OFFLINE_URL, { cache: "reload", credentials: "omit" }));
      if (!res.ok) throw new Error("offline page unavailable");
      await offline.put(OFFLINE_URL, res.clone());
      const statics = await caches.open(STATIC_CACHE);
      await statics.addAll(PRECACHE);
      // CSS/JS/fontes da página offline, para ela aparecer completa mesmo na primeira queda de rede.
      const html = await res.text();
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)<>]+\.(?:css|js|woff2)/g) || [])].slice(0, 60);
      await Promise.all(assets.map((u) => statics.add(u).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    /\.(?:woff2?|ttf|otf)$/.test(url.pathname)
  );
}

function isPrivate(url) {
  const path = url.pathname;
  return PRIVATE_PREFIXES.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Só respostas completas, da mesma origem e públicas.
  const cc = res.headers.get("cache-control") || "";
  if (res.ok && res.type === "basic" && !/no-store|private/.test(cc)) {
    await cache.put(request, res.clone());
    trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES).catch(() => undefined);
  }
  return res;
}

async function networkWithOfflineFallback(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
    return (
      offline ||
      new Response("<!doctype html><meta charset=utf-8><title>Sem conexão</title><p>Você está sem conexão. Tente de novo.</p>", {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // HTML nunca vai para o cache; só usamos /offline quando a rede falha.
    event.respondWith(networkWithOfflineFallback(event));
    return;
  }
  if (isPrivate(url)) return;
  if (request.headers.has("rsc") || request.headers.has("next-router-state-tree")) return;
  if (isStaticAsset(url)) event.respondWith(cacheFirst(request));
});

// ─────────────────────────────────────────────────────────────
// Push
// ─────────────────────────────────────────────────────────────

function internalPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/notificacoes";
  return value;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Mixtour", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 120) : "Mixtour";
  const body = typeof data.body === "string" ? data.body.slice(0, 300) : "";
  const url = internalPath(data.url);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "pt-BR",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(internalPath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if (client.url !== target && "navigate" in client) await client.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

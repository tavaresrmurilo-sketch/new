"use client";

/**
 * Ponte com o app nativo (Capacitor). No Android/iOS usa os plugins nativos;
 * no navegador cai nas APIs web equivalentes. Os plugins são importados sob
 * demanda para não pesar no bundle do site.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function cap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** true dentro do app Android/iOS. */
export function isNativeApp(): boolean {
  return Boolean(cap()?.isNativePlatform?.());
}

export function nativePlatform(): "android" | "ios" | "web" {
  const p = cap()?.getPlatform?.();
  return p === "android" || p === "ios" ? p : "web";
}

export interface Position {
  lat: number;
  lng: number;
  accuracy: number;
}

export class LocationError extends Error {
  constructor(
    message: string,
    public code: "denied" | "unavailable" | "timeout",
  ) {
    super(message);
  }
}

/** Localização atual (pede permissão na primeira vez). */
export async function getCurrentPosition(opts: { timeoutMs?: number; highAccuracy?: boolean } = {}): Promise<Position> {
  const timeout = opts.timeoutMs ?? 12_000;
  if (isNativeApp()) {
    const { Geolocation } = await import("@capacitor/geolocation");
    try {
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        const req = await Geolocation.requestPermissions({ permissions: ["location"] });
        if (req.location !== "granted") throw new LocationError("Sem permissão para ver sua localização.", "denied");
      }
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: opts.highAccuracy ?? true, timeout, maximumAge: 60_000 });
      return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    } catch (err) {
      if (err instanceof LocationError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/denied|permission/i.test(msg)) throw new LocationError("Sem permissão para ver sua localização.", "denied");
      if (/timeout/i.test(msg)) throw new LocationError("A localização demorou demais para responder.", "timeout");
      throw new LocationError("Não foi possível obter sua localização agora.", "unavailable");
    }
  }
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    throw new LocationError("Seu navegador não informa a localização.", "unavailable");
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          e.code === e.PERMISSION_DENIED
            ? new LocationError("Sem permissão para ver sua localização.", "denied")
            : e.code === e.TIMEOUT
              ? new LocationError("A localização demorou demais para responder.", "timeout")
              : new LocationError("Não foi possível obter sua localização agora.", "unavailable"),
        ),
      { enableHighAccuracy: opts.highAccuracy ?? true, timeout, maximumAge: 60_000 },
    );
  });
}

/**
 * Compartilhar: folha nativa no app; Web Share API no celular; senão copia o link.
 * Retorna "shared" | "copied" | "dismissed".
 */
export async function shareLink(data: { title: string; text?: string; url: string }): Promise<"shared" | "copied" | "dismissed"> {
  if (isNativeApp()) {
    const { Share } = await import("@capacitor/share");
    try {
      await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: "Compartilhar evento" });
      return "shared";
    } catch {
      return "dismissed";
    }
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "dismissed";
    }
  }
  await navigator.clipboard?.writeText(data.url);
  return "copied";
}

/** Vibração curta de confirmação (somente no app). */
export async function haptic(kind: "light" | "success" | "warning" = "light"): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "light") await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: kind === "success" ? NotificationType.Success : NotificationType.Warning });
  } catch {
    /* aparelho sem motor de vibração */
  }
}

/**
 * Abre um link externo. No app usa o navegador do sistema embutido
 * (Custom Tabs / SFSafariViewController); no site, nova aba.
 */
export async function openExternal(url: string): Promise<void> {
  const absolute = new URL(url, window.location.origin).toString();
  if (isNativeApp()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: absolute, presentationStyle: "popover", toolbarColor: "#08080d" });
    return;
  }
  window.open(absolute, "_blank", "noopener,noreferrer");
}

/** Cor dos ícones da barra de status conforme o tema do app. */
export async function setStatusBarTheme(dark: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (nativePlatform() === "android") await StatusBar.setOverlaysWebView({ overlay: true });
  } catch {
    /* plugin indisponível */
  }
}

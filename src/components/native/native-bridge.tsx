"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { isNativeApp, nativePlatform, setStatusBarTheme } from "@/lib/native";
import { safeNextPath } from "@/lib/utils";

/**
 * Integra o app nativo (Capacitor) com o Next.js: deep links, barra de status
 * acompanhando o tema e splash screen. Não faz nada no navegador.
 */
export function NativeBridge() {
  const router = useRouter();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add("native-app", `native-${nativePlatform()}`);
    let cleanup: (() => void) | undefined;
    (async () => {
      const [{ App }, { SplashScreen }] = await Promise.all([import("@capacitor/app"), import("@capacitor/splash-screen")]);
      await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => undefined);
      // Universal/App Links: abre a rota correspondente dentro do app.
      const handle = await App.addListener("appUrlOpen", ({ url }) => {
        try {
          const u = new URL(url);
          if (u.host === window.location.host) router.push(safeNextPath(`${u.pathname}${u.search}`, "/"));
        } catch {
          /* URL inválida */
        }
      });
      cleanup = () => void handle.remove();
    })();
    return () => cleanup?.();
  }, [router]);

  useEffect(() => {
    void setStatusBarTheme(resolvedTheme !== "light");
  }, [resolvedTheme]);

  return null;
}

const TOKEN_KEY = "mx:push-token";
const ASKED_KEY = "mx:push-asked";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function sendToken(method: "POST" | "DELETE", body: Record<string, string>) {
  await fetch("/api/push/device", {
    method,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

/**
 * Push nativo: com a pessoa logada, registra o aparelho (pede permissão uma vez);
 * sem sessão, desliga o token deste aparelho (ninguém recebe avisos de outra conta).
 */
export function NativePushSync({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    const store = storage();
    let cleanup: (() => void) | undefined;

    (async () => {
      const { PushNotifications } = await import("@capacitor/push-notifications");

      if (!loggedIn) {
        const old = store?.getItem(TOKEN_KEY);
        if (old) {
          await sendToken("DELETE", { token: old });
          store?.removeItem(TOKEN_KEY);
        }
        return;
      }

      const handles = await Promise.all([
        PushNotifications.addListener("registration", async ({ value }) => {
          const platform = nativePlatform() === "ios" ? "IOS" : "ANDROID";
          await sendToken("POST", { platform, token: value });
          store?.setItem(TOKEN_KEY, value);
        }),
        PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
          const url = (notification.data as { url?: string } | undefined)?.url;
          router.push(safeNextPath(url, "/notificacoes"));
        }),
      ]);
      cleanup = () => handles.forEach((h) => void h.remove());

      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === "prompt" && !store?.getItem(ASKED_KEY)) {
        store?.setItem(ASKED_KEY, "1");
        perm = await PushNotifications.requestPermissions();
      }
      if (perm.receive === "granted") await PushNotifications.register();
    })().catch(() => undefined);

    return () => cleanup?.();
  }, [loggedIn, router]);

  return null;
}

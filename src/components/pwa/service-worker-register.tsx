"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native";

/**
 * Registra o service worker (/sw.js) somente em produção — em desenvolvimento
 * o cache atrapalharia o recarregamento do código.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    // No app nativo o WebView carrega o site direto; o cache offline é do próprio app.
    if (process.env.NODE_ENV !== "production" || isNativeApp() || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => console.warn("[sw] registro falhou", err));
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}

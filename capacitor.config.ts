import type { CapacitorConfig } from "@capacitor/cli";

/**
 * App nativo (Android/iOS) do Mixtour.
 *
 * O Mixtour renderiza no servidor (Next.js), então o app carrega a URL de produção
 * (CAPACITOR_SERVER_URL) dentro do WebView nativo e usa plugins para os recursos do
 * aparelho (localização, push, compartilhar, vibração, barra de status, links).
 * Sem conexão, o WebView mostra mobile-shell/offline.html.
 *
 * Antes de `npx cap sync` para uma versão de loja:
 *   CAPACITOR_SERVER_URL=https://seu-dominio  CAPACITOR_APP_ID=br.com.suaempresa.mixtour
 * Veja docs/MOBILE.md.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL || "http://localhost:3000";
const host = new URL(serverUrl).hostname;

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || "app.mixtour",
  appName: "Mixtour",
  webDir: "mobile-shell",
  backgroundColor: "#08080d",
  appendUserAgent: "MixtourApp",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    errorPath: "offline.html",
    // Login com Google e checkout do Stripe abrem fora do app (navegador do sistema).
    allowNavigation: [host],
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
    scrollEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#08080d",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#00000000",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — eventos perto de você`,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    start_url: "/?origem=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08080d",
    theme_color: "#08080d",
    lang: "pt-BR",
    categories: ["entertainment", "lifestyle", "travel"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Eventos hoje", url: "/?quando=today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Minha agenda", url: "/salvos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

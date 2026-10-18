import type { MetadataRoute } from "next";
import { appUrl } from "@/server/env";
import { sitemapEvents, sitemapOrganizers } from "@/server/events/detail";

export const dynamic = "force-dynamic";

/** Páginas públicas estáticas (só as que existem para visitantes sem login). */
const STATIC_PATHS: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1, changeFrequency: "hourly" },
  { path: "/para-organizadores", priority: 0.7, changeFrequency: "weekly" },
  { path: "/termos", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacidade", priority: 0.2, changeFrequency: "yearly" },
];

/**
 * Sitemap: páginas estáticas, eventos com página pública que ainda não
 * terminaram (ou terminaram há menos de 90 dias) e organizadores ativos com eventos.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [events, organizers] = await Promise.all([sitemapEvents(now), sitemapOrganizers()]);
  return [
    ...STATIC_PATHS.map((p) => ({ url: appUrl(p.path), changeFrequency: p.changeFrequency, priority: p.priority })),
    ...events.map((e) => ({
      url: appUrl(`/evento/${e.slug}`),
      lastModified: e.updatedAt,
      changeFrequency: e.endsAt >= now ? ("daily" as const) : ("monthly" as const),
      priority: e.endsAt >= now ? 0.8 : 0.3,
    })),
    ...organizers.map((o) => ({ url: appUrl(`/organizador/${o.slug}`), lastModified: o.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}

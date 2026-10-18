/** URLs das APIs públicas da tela Explorar (isomórfico: usado pelo servidor e pelo cliente). */
import { bboxParam, serializeFilters, type ExploreFilters } from "@/lib/explore-params";
import type { BBox, LatLng } from "@/lib/geo";

export function nearParam(near: LatLng | null): string | null {
  return near ? `${near.lat.toFixed(4)},${near.lng.toFixed(4)}` : null;
}

/** URL da API de pontos (a ordenação não muda os pontos). */
export function pointsUrl(bbox: BBox | null, filters: ExploreFilters): string {
  const qs = [serializeFilters({ ...filters, sort: "relevancia" }), bbox ? `bbox=${bboxParam(bbox)}` : ""].filter(Boolean).join("&");
  return `/api/events/map${qs ? `?${qs}` : ""}`;
}

/** URL da primeira página da lista. */
export function listUrl(bbox: BBox | null, near: LatLng | null, filters: ExploreFilters): string {
  const n = nearParam(near);
  const qs = [serializeFilters(filters), bbox ? `bbox=${bboxParam(bbox)}` : "", n ? `near=${n}` : ""].filter(Boolean).join("&");
  return `/api/events${qs ? `?${qs}` : ""}`;
}

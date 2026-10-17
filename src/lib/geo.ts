export interface LatLng {
  lat: number;
  lng: number;
}

/** [oeste, sul, leste, norte] */
export type BBox = [number, number, number, number];

const R = 6371; // km

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** "w,s,e,n" → BBox validado (limita a área para evitar consultas gigantes). */
export function parseBBox(value: string | null | undefined): BBox | null {
  if (!value) return null;
  const parts = value.split(",").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  let [w, s, e, n] = parts;
  s = Math.max(-90, Math.min(90, s));
  n = Math.max(-90, Math.min(90, n));
  w = Math.max(-180, Math.min(180, w));
  e = Math.max(-180, Math.min(180, e));
  if (n <= s || e <= w) return null;
  return [w, s, e, n];
}

export function bboxAround(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
  return [center.lng - dLng, Math.max(-90, center.lat - dLat), center.lng + dLng, Math.min(90, center.lat + dLat)];
}

export function bboxCenter([w, s, e, n]: BBox): LatLng {
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/** Links de rota para apps de navegação. */
export function directionsLinks(p: LatLng, label?: string) {
  const q = `${p.lat},${p.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`,
    waze: `https://waze.com/ul?ll=${encodeURIComponent(q)}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${encodeURIComponent(q)}${label ? `&q=${encodeURIComponent(label)}` : ""}`,
    uber: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=${p.lat}&dropoff[longitude]=${p.lng}${label ? `&dropoff[nickname]=${encodeURIComponent(label)}` : ""}`,
  };
}

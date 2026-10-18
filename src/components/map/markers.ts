/**
 * Pinos e agrupamentos do mapa Explorar como marcadores HTML (sem React por pino).
 * Elementos são reaproveitados por id entre renderizações para não piscar;
 * o agrupamento é feito no cliente com Supercluster.
 */
import type { Map as MLMap, Marker } from "maplibre-gl";
import Supercluster, { type ClusterProperties, type PointFeature } from "supercluster";
import { eventWhenLabel } from "@/lib/format";
import { iconSvg } from "./icon-svg";

type MapLibre = typeof import("maplibre-gl");

export interface PinPoint {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  cat: string;
  icon: string;
  color: string;
  featured: boolean;
  live: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}

export interface PinLayerHandlers {
  onSelect(id: string): void;
  /** Vários eventos no mesmo local (não se separam nem no zoom máximo). */
  onSpot(ids: string[], center: { lat: number; lng: number }): void;
}

interface PinProps {
  id: string;
  live: number;
  featured: number;
}
type ClusterProps = { live: number; featured: number };

/** Zoom máximo do agrupamento = zoom máximo do mapa: pontos no mesmo endereço nunca se sobrepõem. */
export const CLUSTER_MAX_ZOOM = 18;
const CLUSTER_RADIUS = 58;
/** Distância (graus) abaixo da qual consideramos os eventos "no mesmo local" (~20 m). */
const SAME_SPOT_DEG = 0.0002;
const SAFE_COLOR = /^#[0-9a-f]{6}$/i;

const STYLE_ID = "mx-map-markers";
const CSS = `
.mx-marker{position:absolute;top:0;left:0;padding:0;margin:0;border:0;background:none;font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;outline:none}
.mx-pin{width:40px;height:50px;display:block}
.mx-pin__inner{position:absolute;inset:0;transform-origin:50% 100%;transition:transform .22s cubic-bezier(.2,.9,.3,1.3)}
.mx-pin__body{position:absolute;left:50%;top:4px;width:34px;height:34px;margin-left:-17px;border-radius:999px;display:grid;place-items:center;color:#fff;background:var(--pin-color);border:2.5px solid #fff;box-shadow:0 6px 14px -4px rgb(0 0 0/.5),0 1px 3px rgb(0 0 0/.35);z-index:2}
.mx-pin__body svg{width:16px;height:16px;display:block}
.mx-pin__tip{position:absolute;left:50%;top:31px;width:12px;height:12px;margin-left:-6px;background:var(--pin-color);border-right:2.5px solid #fff;border-bottom:2.5px solid #fff;border-bottom-right-radius:3px;transform:rotate(45deg);z-index:1;box-shadow:3px 3px 6px -2px rgb(0 0 0/.35)}
.mx-pin::after{content:"";position:absolute;left:50%;bottom:0;width:14px;height:5px;margin-left:-7px;border-radius:50%;background:rgb(0 0 0/.28);filter:blur(1.5px)}
.mx-pin--featured .mx-pin__body{width:40px;height:40px;margin-left:-20px;top:0;border:3px solid transparent;background:linear-gradient(var(--pin-color),var(--pin-color)) padding-box,linear-gradient(135deg,#7c5cff,#ff4d8d 60%,#ff8a3d) border-box}
.mx-pin--featured .mx-pin__body svg{width:18px;height:18px}
.mx-pin--featured .mx-pin__tip{top:31px}
.mx-pin__halo{position:absolute;left:50%;top:4px;width:34px;height:34px;margin-left:-17px;border-radius:999px;background:var(--pin-color);opacity:0;z-index:0;pointer-events:none}
.mx-pin--featured .mx-pin__halo{top:0;width:40px;height:40px;margin-left:-20px}
.mx-pin--live .mx-pin__halo{animation:mx-pulse 1.9s ease-out infinite}
.mx-pin--live .mx-pin__body::after{content:"";position:absolute;top:-3px;right:-3px;width:11px;height:11px;border-radius:999px;background:#22c55e;border:2px solid #fff}
.mx-pin__label{position:absolute;left:50%;top:calc(100% + 4px);transform:translateX(-50%) translateY(-4px);max-width:200px;padding:5px 10px;border-radius:999px;background:var(--elevated,#fff);color:var(--foreground,#111);font-size:12px;line-height:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 6px 18px -6px rgb(0 0 0/.45),0 0 0 1px var(--border,rgb(0 0 0/.08));opacity:0;pointer-events:none;transition:opacity .15s ease,transform .18s ease}
.mx-pin:hover .mx-pin__inner{transform:scale(1.1)}
.mx-pin:hover .mx-pin__label,.mx-pin:focus-visible .mx-pin__label,.mx-pin--highlight .mx-pin__label,.mx-pin--selected .mx-pin__label{opacity:1;transform:translateX(-50%) translateY(0)}
.mx-pin--highlight .mx-pin__inner,.mx-pin--highlight:hover .mx-pin__inner{transform:scale(1.18)}
.mx-pin--selected .mx-pin__inner,.mx-pin--selected:hover .mx-pin__inner{transform:scale(1.32)}
.mx-pin--selected .mx-pin__label{top:calc(100% + 10px)}
.mx-pin--selected .mx-pin__body{box-shadow:0 0 0 4px color-mix(in srgb,var(--pin-color) 35%,transparent),0 10px 22px -6px rgb(0 0 0/.6)}
.mx-pin:focus-visible .mx-pin__body{outline:3px solid var(--ring,#7c5cff);outline-offset:3px}
.mx-pin--enter .mx-pin__inner{animation:mx-pop .26s cubic-bezier(.2,.9,.3,1.3) both}
.mx-cluster{width:var(--size);height:var(--size);border-radius:999px;display:grid;place-items:center;color:#fff;font-weight:800;font-size:var(--font);letter-spacing:-.02em;background:linear-gradient(135deg,#7c5cff 0%,#b04dff 45%,#ff4d8d 80%,#ff8a3d 100%);border:3px solid rgb(255 255 255/.92);box-shadow:0 0 0 6px rgb(124 92 255/.22),0 10px 24px -8px rgb(0 0 0/.6);transition:transform .2s cubic-bezier(.2,.9,.3,1.3)}
.mx-cluster:hover{transform:scale(1.08)}
.mx-cluster:focus-visible{outline:3px solid var(--ring,#7c5cff);outline-offset:4px}
.mx-cluster--enter{animation:mx-pop .26s cubic-bezier(.2,.9,.3,1.3) both}
.mx-cluster__live{position:absolute;top:-1px;right:-1px;width:12px;height:12px;border-radius:999px;background:#22c55e;border:2px solid #fff}
.mx-cluster__live::before{content:"";position:absolute;inset:-2px;border-radius:999px;background:#22c55e;animation:mx-pulse 1.9s ease-out infinite}
.mx-me{position:absolute;top:0;left:0;width:22px;height:22px;pointer-events:none}
.mx-me__accuracy{position:absolute;left:50%;top:50%;border-radius:999px;background:rgb(59 130 246/.14);border:1px solid rgb(59 130 246/.35);transform:translate(-50%,-50%);transition:width .2s,height .2s}
.mx-me__pulse{position:absolute;inset:0;border-radius:999px;background:rgb(59 130 246/.55);animation:mx-pulse 2s ease-out infinite}
.mx-me__dot{position:absolute;inset:3px;border-radius:999px;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgb(0 0 0/.45)}
.mx-popup{z-index:2000000}
.mx-popup .maplibregl-popup-content{padding:0;background:transparent;box-shadow:none;border-radius:24px}
.mx-popup .maplibregl-popup-tip{display:none}
.maplibregl-map{font-family:var(--font-sans);background:var(--map-bg)}
@keyframes mx-pulse{0%{transform:scale(.8);opacity:.7}100%{transform:scale(2.4);opacity:0}}
@keyframes mx-pop{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion:reduce){.mx-pin__inner,.mx-cluster{transition:none}.mx-pin--live .mx-pin__halo,.mx-me__pulse,.mx-cluster__live::before,.mx-pin--enter .mx-pin__inner,.mx-cluster--enter{animation:none}}
`;

/** Injeta (uma vez) os estilos dos marcadores do mapa. Conteúdo estático, sem dados de usuário. */
export function ensureMapStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function safeColor(color: string | null | undefined, fallback = "#7c5cff"): string {
  return color && SAFE_COLOR.test(color) ? color : fallback;
}

export function pinAriaLabel(p: Pick<PinPoint, "title" | "startsAt" | "endsAt" | "timezone">, now: Date = new Date()): string {
  const when = eventWhenLabel(new Date(p.startsAt), new Date(p.endsAt), now, p.timezone);
  return `${p.title} — ${when}`;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(".", ",").replace(",0", "")} mil`;
  return `${Math.round(n / 1000)} mil`;
}

export function clusterSize(count: number): number {
  return Math.round(38 + Math.min(30, Math.log2(Math.max(2, count)) * 5.5));
}

function latRank(lat: number) {
  // pinos mais ao sul ficam por cima (sobreposição natural em perspectiva)
  return Math.round((90 - lat) * 100);
}

interface Entry {
  key: string;
  kind: "pin" | "cluster";
  marker: Marker;
  el: HTMLButtonElement;
  lng: number;
  lat: number;
  sig: string;
  baseZ: number;
}

export class PinLayer {
  private index: Supercluster<PinProps, ClusterProps>;
  private byId = new Map<string, PinPoint>();
  private entries = new Map<string, Entry>();
  private selected: string | null = null;
  private highlighted: string | null = null;
  private frame = 0;
  private lastZoom = -1;
  private destroyed = false;

  constructor(
    private maplibre: MapLibre,
    private map: MLMap,
    private handlers: PinLayerHandlers,
  ) {
    ensureMapStyles();
    this.index = this.makeIndex();
    map.on("moveend", this.schedule);
    map.on("zoom", this.onZoom);
  }

  private makeIndex() {
    return new Supercluster<PinProps, ClusterProps>({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      minPoints: 2,
      map: (p) => ({ live: p.live, featured: p.featured }),
      reduce: (acc, p) => {
        acc.live += p.live;
        acc.featured += p.featured;
      },
    });
  }

  setPoints(points: PinPoint[]) {
    this.byId = new Map(points.map((p) => [p.id, p]));
    this.index = this.makeIndex();
    this.index.load(
      points.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: { id: p.id, live: p.live ? 1 : 0, featured: p.featured ? 1 : 0 },
      })),
    );
    this.render();
  }

  setSelected(id: string | null) {
    if (this.selected === id) return;
    this.selected = id;
    this.render();
  }

  setHighlighted(id: string | null) {
    if (this.highlighted === id) return;
    this.highlighted = id;
    this.render();
  }

  getPoint(id: string): PinPoint | undefined {
    return this.byId.get(id);
  }

  /** Foca (teclado) o pino de um evento, se estiver visível. */
  focusPin(id: string) {
    this.entries.get(id)?.el.focus();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.map.off("moveend", this.schedule);
    this.map.off("zoom", this.onZoom);
    for (const e of this.entries.values()) e.marker.remove();
    this.entries.clear();
  }

  private onZoom = () => {
    const z = Math.floor(this.map.getZoom());
    if (z !== this.lastZoom) this.schedule();
  };

  private schedule = () => {
    if (this.destroyed) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.render());
  };

  render() {
    if (this.destroyed) return;
    const zoom = Math.floor(this.map.getZoom());
    this.lastZoom = zoom;
    const b = this.map.getBounds();
    const dx = (b.getEast() - b.getWest()) * 0.15;
    const dy = (b.getNorth() - b.getSouth()) * 0.15;
    const west = b.getWest() - dx;
    const east = b.getEast() + dx;
    const bbox: [number, number, number, number] =
      east - west >= 360 ? [-180, -85, 180, 85] : [west, Math.max(-85, b.getSouth() - dy), east, Math.min(85, b.getNorth() + dy)];
    const features = this.byId.size ? this.index.getClusters(bbox, zoom) : [];
    const seen = new Set<string>();
    const now = new Date();

    for (const f of features) {
      const [lng, lat] = f.geometry.coordinates;
      if ("cluster" in f.properties && f.properties.cluster) {
        const p = f.properties as ClusterProperties & ClusterProps;
        const key = `c:${zoom}:${lng.toFixed(5)},${lat.toFixed(5)}`;
        seen.add(key);
        this.upsertCluster(key, p.cluster_id, p.point_count, p.live > 0, lng, lat);
      } else {
        const id = (f.properties as PinProps).id;
        const point = this.byId.get(id);
        if (!point) continue;
        seen.add(id);
        this.upsertPin(point, now);
      }
    }
    // Selecionado e destacado sempre aparecem, mesmo dentro de um agrupamento.
    for (const id of [this.selected, this.highlighted]) {
      if (id && !seen.has(id)) {
        const point = this.byId.get(id);
        if (point) {
          seen.add(id);
          this.upsertPin(point, now);
        }
      }
    }
    for (const [key, entry] of this.entries) {
      if (!seen.has(key)) {
        entry.marker.remove();
        this.entries.delete(key);
      }
    }
  }

  private upsertPin(p: PinPoint, now: Date) {
    const selected = this.selected === p.id;
    const highlighted = this.highlighted === p.id;
    const sig = `${p.featured}|${p.live}|${selected}|${highlighted}|${p.color}|${p.icon}|${p.title}|${p.startsAt}`;
    let entry = this.entries.get(p.id);
    if (!entry) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mx-marker mx-pin mx-pin--enter";
      el.dataset.id = p.id;
      el.innerHTML =
        '<span class="mx-pin__inner" aria-hidden="true"><span class="mx-pin__halo"></span><span class="mx-pin__body"></span><span class="mx-pin__tip"></span></span><span class="mx-pin__label" aria-hidden="true"></span>';
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.handlers.onSelect(p.id);
      });
      el.addEventListener("animationend", () => el.classList.remove("mx-pin--enter"), { once: true });
      const marker = new this.maplibre.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(this.map);
      entry = { key: p.id, kind: "pin", marker, el, lng: p.lng, lat: p.lat, sig: "", baseZ: 0 };
      this.entries.set(p.id, entry);
    } else if (entry.lng !== p.lng || entry.lat !== p.lat) {
      entry.marker.setLngLat([p.lng, p.lat]);
      entry.lng = p.lng;
      entry.lat = p.lat;
    }
    if (entry.sig !== sig) {
      const el = entry.el;
      el.style.setProperty("--pin-color", safeColor(p.color));
      el.classList.toggle("mx-pin--featured", p.featured);
      el.classList.toggle("mx-pin--live", p.live);
      el.classList.toggle("mx-pin--selected", selected);
      el.classList.toggle("mx-pin--highlight", highlighted && !selected);
      el.setAttribute("aria-label", pinAriaLabel(p, now) + (p.featured ? " · destaque" : ""));
      el.setAttribute("aria-pressed", selected ? "true" : "false");
      const body = el.querySelector(".mx-pin__body");
      if (body) body.innerHTML = iconSvg(p.icon, p.featured ? 18 : 16, 2.4);
      const label = el.querySelector(".mx-pin__label");
      if (label) label.textContent = p.title;
      entry.sig = sig;
    }
    entry.baseZ = latRank(p.lat) + (p.featured ? 20_000 : 10_000);
    entry.el.style.zIndex = String(selected ? 1_000_000 : highlighted ? 900_000 : entry.baseZ);
  }

  private upsertCluster(key: string, clusterId: number, count: number, live: boolean, lng: number, lat: number) {
    let entry = this.entries.get(key);
    if (!entry) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mx-marker mx-cluster mx-cluster--enter";
      el.addEventListener("animationend", () => el.classList.remove("mx-cluster--enter"), { once: true });
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.expandCluster(Number(el.dataset.cluster), lng, lat);
      });
      const marker = new this.maplibre.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(this.map);
      entry = { key, kind: "cluster", marker, el, lng, lat, sig: "", baseZ: latRank(lat) };
      this.entries.set(key, entry);
    }
    entry.el.dataset.cluster = String(clusterId);
    const sig = `${count}|${live}`;
    if (entry.sig !== sig) {
      const size = clusterSize(count);
      const el = entry.el;
      el.style.setProperty("--size", `${size}px`);
      el.style.setProperty("--font", `${size >= 56 ? 16 : size >= 46 ? 15 : 14}px`);
      el.textContent = formatCount(count);
      if (live) {
        const dot = document.createElement("span");
        dot.className = "mx-cluster__live";
        dot.setAttribute("aria-hidden", "true");
        el.appendChild(dot);
      }
      el.setAttribute("aria-label", `${count} eventos agrupados${live ? ", alguns acontecendo agora" : ""}. Aproximar o mapa`);
      entry.sig = sig;
    }
    entry.el.style.zIndex = String(entry.baseZ);
  }

  private expandCluster(clusterId: number, lng: number, lat: number) {
    let leaves: PointFeature<PinProps>[] = [];
    try {
      leaves = this.index.getLeaves(clusterId, 200);
    } catch {
      return; // índice recarregado entre o clique e o tratamento
    }
    const lngs = leaves.map((l) => l.geometry.coordinates[0]);
    const lats = leaves.map((l) => l.geometry.coordinates[1]);
    const spread = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
    const expansion = this.index.getClusterExpansionZoom(clusterId);
    const zoom = this.map.getZoom();
    if (spread <= SAME_SPOT_DEG || expansion > CLUSTER_MAX_ZOOM || zoom >= this.map.getMaxZoom() - 0.01) {
      // Mesmo local: abre a lista desse lugar (e aproxima, se ainda estiver longe).
      if (zoom < 15) this.map.easeTo({ center: [lng, lat], zoom: 16, duration: 600 });
      this.handlers.onSpot(
        leaves.map((l) => l.properties.id),
        { lat, lng },
      );
      return;
    }
    this.map.easeTo({ center: [lng, lat], zoom: Math.min(expansion + 0.2, this.map.getMaxZoom()), duration: 550 });
  }
}

"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { MapLibreEvent, MapMouseEvent, Popup, PositionAnchor } from "maplibre-gl";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { MAX_ZOOM, MIN_ZOOM, normalizeBBox, type MapView } from "@/lib/explore-params";
import type { BBox, LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { PinLayer, type PinPoint } from "./markers";
import { useMap } from "./use-map";
import { UserLocationMarker, type UserPosition } from "./user-location";

export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ExploreMapHandle {
  /** Voa até um ponto, considerando as áreas cobertas por painéis (insets). */
  flyTo(center: LatLng, zoom?: number): void;
  /** Enquadra os pontos (busca). Um único ponto vira flyTo. */
  fitPoints(points: LatLng[], maxZoom?: number): void;
  zoomBy(delta: number): void;
  getView(): MapView | null;
  /** Desloca o mapa se o ponto estiver escondido sob os painéis. */
  ensureVisible(point: LatLng, extra?: Partial<MapInsets>): void;
}

export interface ExploreMapPopup {
  key: string;
  lat: number;
  lng: number;
  content: ReactNode;
}

export interface ExploreMapProps {
  initialView: MapView;
  points: PinPoint[];
  selectedId: string | null;
  highlightId?: string | null;
  userLocation?: UserPosition | null;
  /** Áreas do mapa cobertas por painéis flutuantes (px). */
  insets?: MapInsets;
  popup?: ExploreMapPopup | null;
  onMove?: (view: MapView, bbox: BBox, byUser: boolean) => void;
  onSelect?: (id: string) => void;
  onSpot?: (ids: string[], center: LatLng) => void;
  onMapClick?: () => void;
  overlay?: (state: { degraded: boolean; ready: boolean }) => ReactNode;
  className?: string;
  ref?: Ref<ExploreMapHandle>;
}

const NO_INSETS: MapInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const POPUP_OFFSETS: Record<PositionAnchor, [number, number]> = {
  center: [0, 0],
  top: [0, 14],
  "top-left": [14, 14],
  "top-right": [-14, 14],
  bottom: [0, -72],
  "bottom-left": [10, -64],
  "bottom-right": [-10, -64],
  left: [26, -34],
  right: [-26, -34],
};

/** Mapa da tela Explorar: pinos HTML agrupados, seleção, localização do usuário e popup (desktop). */
export function ExploreMap({
  initialView,
  points,
  selectedId,
  highlightId = null,
  userLocation = null,
  insets = NO_INSETS,
  popup = null,
  onMove,
  onSelect,
  onSpot,
  onMapClick,
  overlay,
  className,
  ref,
}: ExploreMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, degraded } = useMap(containerRef, {
    center: { lat: initialView.lat, lng: initialView.lng },
    zoom: initialView.zoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  });
  const [layer, setLayer] = useState<PinLayer | null>(null);
  const [ready, setReady] = useState(false);
  const insetsRef = useRef(insets);
  const [popupEl] = useState<HTMLDivElement | null>(() => (typeof document === "undefined" ? null : document.createElement("div")));

  useEffect(() => {
    insetsRef.current = insets;
  }, [insets]);

  const emitMove = useEffectEvent((byUser: boolean) => {
    if (!map || !onMove) return;
    const c = map.getCenter();
    const b = map.getBounds();
    onMove(
      { lat: c.lat, lng: ((((c.lng + 180) % 360) + 360) % 360) - 180, zoom: map.getZoom() },
      normalizeBBox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]),
      byUser,
    );
  });
  const emitSelect = useEffectEvent((id: string) => onSelect?.(id));
  const emitSpot = useEffectEvent((ids: string[], center: LatLng) => onSpot?.(ids, center));
  const emitMapClick = useEffectEvent(() => onMapClick?.());

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let pinLayer: PinLayer | null = null;
    map.getCanvas().setAttribute("aria-label", "Mapa interativo de eventos. Use as setas para mover e + ou − para aproximar.");
    import("maplibre-gl").then((m) => {
      if (cancelled) return;
      pinLayer = new PinLayer(m.default, map, {
        onSelect: (id) => emitSelect(id),
        onSpot: (ids, center) => emitSpot(ids, center),
      });
      setLayer(pinLayer);
      setReady(true);
    });
    const onMoveEnd = (e: MapLibreEvent<unknown> & { originalEvent?: unknown }) => emitMove(Boolean(e.originalEvent));
    const onClick = (e: MapMouseEvent) => {
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.(".mx-marker, .maplibregl-popup")) return;
      emitMapClick();
    };
    map.on("moveend", onMoveEnd);
    map.on("click", onClick);
    emitMove(false);
    return () => {
      cancelled = true;
      map.off("moveend", onMoveEnd);
      map.off("click", onClick);
      pinLayer?.destroy();
    };
  }, [map]);

  useEffect(() => {
    layer?.setPoints(points);
  }, [layer, points]);

  useEffect(() => {
    layer?.setSelected(selectedId);
  }, [layer, selectedId]);

  useEffect(() => {
    layer?.setHighlighted(highlightId);
  }, [layer, highlightId]);

  useEffect(() => {
    if (!map || !userLocation) return;
    let cancelled = false;
    let marker: UserLocationMarker | null = null;
    import("maplibre-gl").then((m) => {
      if (!cancelled) marker = new UserLocationMarker(m.default, map, userLocation);
    });
    return () => {
      cancelled = true;
      marker?.remove();
    };
  }, [map, userLocation]);

  const popupKey = popup?.key ?? null;
  const popupLat = popup?.lat;
  const popupLng = popup?.lng;
  useEffect(() => {
    if (!map || !popupEl || popupKey == null || popupLat == null || popupLng == null) return;
    let cancelled = false;
    let instance: Popup | null = null;
    popupEl.setAttribute("role", "dialog");
    popupEl.setAttribute("aria-label", "Evento selecionado");
    import("maplibre-gl").then((m) => {
      if (cancelled) return;
      instance = new m.default.Popup({
        closeButton: false,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        maxWidth: "none",
        offset: POPUP_OFFSETS,
        className: "mx-popup",
      })
        .setLngLat([popupLng, popupLat])
        .setDOMContent(popupEl)
        .addTo(map);
    });
    return () => {
      cancelled = true;
      instance?.remove();
    };
  }, [map, popupEl, popupKey, popupLat, popupLng]);

  useImperativeHandle(
    ref,
    (): ExploreMapHandle => {
      const offsetFor = (extra?: Partial<MapInsets>): [number, number] => {
        const i = { ...insetsRef.current, ...extra };
        return [(i.left - i.right) / 2, (i.top - i.bottom) / 2];
      };
      const flyTo = (center: LatLng, zoom?: number) => {
        if (!map) return;
        map.flyTo({
          center: [center.lng, center.lat],
          zoom: zoom ?? Math.max(map.getZoom(), 13),
          offset: offsetFor(),
          duration: 1100,
          essential: true,
        });
      };
      return {
        flyTo,
        fitPoints(pts, maxZoom = 15) {
          if (!map || !pts.length) return;
          const lngs = pts.map((p) => p.lng);
          const lats = pts.map((p) => p.lat);
          const w = Math.min(...lngs);
          const e = Math.max(...lngs);
          const s = Math.min(...lats);
          const n = Math.max(...lats);
          if (e - w < 0.002 && n - s < 0.002) {
            flyTo({ lat: (s + n) / 2, lng: (w + e) / 2 }, Math.min(maxZoom, 15));
            return;
          }
          const i = insetsRef.current;
          const canvas = map.getCanvas();
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          const pad = (v: number, total: number) => Math.max(16, Math.min(v + 48, total / 2 - 40));
          map.fitBounds(
            [
              [w, s],
              [e, n],
            ],
            {
              padding: { top: pad(i.top, height), bottom: pad(i.bottom, height), left: pad(i.left, width), right: pad(i.right, width) },
              maxZoom,
              duration: 900,
              essential: true,
            },
          );
        },
        zoomBy(delta) {
          if (!map) return;
          map.easeTo({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, map.getZoom() + delta)), duration: 450 });
        },
        getView() {
          if (!map) return null;
          const c = map.getCenter();
          return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
        },
        ensureVisible(point, extra) {
          if (!map) return;
          const i = { ...insetsRef.current, ...extra };
          const canvas = map.getCanvas();
          const width = canvas.clientWidth;
          const height = canvas.clientHeight;
          const p = map.project([point.lng, point.lat]);
          const margin = 24;
          const inside =
            p.x >= i.left + margin && p.x <= width - i.right - margin && p.y >= i.top + margin && p.y <= height - i.bottom - margin;
          if (inside) return;
          map.easeTo({ center: [point.lng, point.lat], offset: offsetFor(extra), duration: 500 });
        },
      };
    },
    [map],
  );

  return (
    <div className={cn("relative overflow-hidden bg-[var(--map-bg)]", className)}>
      {/* estilo inline: o CSS do MapLibre (fora das camadas do Tailwind) força position: relative em .maplibregl-map */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {overlay?.({ degraded, ready })}
      {popupEl && popup ? createPortal(popup.content, popupEl) : null}
    </div>
  );
}

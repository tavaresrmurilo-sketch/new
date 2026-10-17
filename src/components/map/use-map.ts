"use client";

import type { Map as MLMap } from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type RefObject } from "react";
import { blankStyle, styleFor } from "./map-style";

export interface UseMapOptions {
  center: { lat: number; lng: number };
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  interactive?: boolean;
  /** Mostra controles de zoom/bússola (desktop). */
  navigationControl?: boolean;
  cooperativeGestures?: boolean;
}

export interface UseMapResult {
  map: MLMap | null;
  /** true quando o mapa base do provedor falhou e estamos usando o fallback sem tiles. */
  degraded: boolean;
  dark: boolean;
}

/**
 * Cria um mapa MapLibre no container, com estilo conforme o tema (claro/escuro),
 * troca de estilo sem recriar o mapa e fallback automático para um estilo sem rede.
 */
export function useMap(containerRef: RefObject<HTMLDivElement | null>, opts: UseMapOptions): UseMapResult {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const [map, setMap] = useState<MLMap | null>(null);
  const [degraded, setDegraded] = useState(false);
  const initial = useRef({ opts, dark });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    let instance: MLMap | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled) return;
      const { opts: o, dark: d } = initial.current;
      instance = new maplibregl.Map({
        container: el,
        style: styleFor(d),
        center: [o.center.lng, o.center.lat],
        zoom: o.zoom,
        minZoom: o.minZoom ?? 2,
        maxZoom: o.maxZoom ?? 18,
        interactive: o.interactive ?? true,
        attributionControl: { compact: true },
        cooperativeGestures: o.cooperativeGestures ?? false,
        dragRotate: false,
        pitchWithRotate: false,
        fadeDuration: 150,
        locale: {
          "AttributionControl.ToggleAttribution": "Alternar atribuição",
          "NavigationControl.ZoomIn": "Aproximar",
          "NavigationControl.ZoomOut": "Afastar",
          "NavigationControl.ResetBearing": "Apontar para o norte",
          "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + rolagem para dar zoom no mapa",
          "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + rolagem para dar zoom no mapa",
          "CooperativeGesturesHandler.MobileHelpText": "Use dois dedos para mover o mapa",
        },
      });
      instance.touchZoomRotate.disableRotation();
      if (o.navigationControl) instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      const applyFallback = () => {
        if (!instance || cancelled) return;
        setDegraded(true);
        instance.setStyle(blankStyle(initial.current.dark));
      };
      fallbackTimer = setTimeout(() => {
        if (instance && !instance.isStyleLoaded()) applyFallback();
      }, 8000);
      instance.on("error", (e) => {
        const err = e.error as { status?: number; message?: string } | undefined;
        // Falha ao baixar o style.json (rede bloqueada, provedor fora do ar).
        if (instance && !instance.isStyleLoaded() && (err?.status || /fetch|network|style/i.test(err?.message ?? ""))) applyFallback();
      });
      instance.once("load", () => clearTimeout(fallbackTimer));
      if (!cancelled) setMap(instance);
    })();

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
      instance?.remove();
      setMap(null);
    };
  }, [containerRef]);

  // Troca o estilo ao mudar o tema (marcadores HTML continuam no lugar).
  useEffect(() => {
    if (!map) return;
    if (initial.current.dark === dark) return;
    initial.current.dark = dark;
    map.setStyle(degraded ? blankStyle(dark) : styleFor(dark));
  }, [dark, map, degraded]);

  return { map, degraded, dark };
}

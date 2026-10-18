"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CategoryIcon } from "@/components/events/category-icon";
import { useMap } from "@/components/map/use-map";
import { cn } from "@/lib/utils";

function MapCanvas({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { map } = useMap(ref, { center: { lat, lng }, zoom, interactive: false });
  useEffect(() => {
    map?.jumpTo({ center: [lng, lat], zoom });
  }, [map, lat, lng, zoom]);
  return <div ref={ref} className="absolute inset-0" aria-hidden />;
}

/**
 * Mapa pequeno e não interativo com o pino na cor da categoria. Só carrega o
 * MapLibre quando entra na tela; o clique abre o local no Google Maps.
 */
export function MiniMap({
  lat,
  lng,
  color,
  icon,
  label,
  className,
  zoom = 15,
}: {
  lat: number;
  lng: number;
  color: string;
  icon: string;
  label: string;
  className?: string;
  zoom?: number;
}) {
  const box = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  return (
    <a
      ref={box}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Ver ${label} no Google Maps`}
      className={cn("group relative block overflow-hidden rounded-2xl border border-border bg-[var(--map-bg)]", className)}
    >
      {/* Malha discreta enquanto o mapa carrega (ou se o provedor de mapas falhar). */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--foreground) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--foreground) 7%, transparent) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {visible && <MapCanvas lat={lat} lng={lng} zoom={zoom} />}
      {/* O pino é um quadrado girado 45°: a ponta fica ~9 px abaixo da caixa, por isso o -mt. */}
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10 -mt-[9px] -translate-x-1/2 -translate-y-full">
        <span className="absolute -bottom-[9px] left-1/2 h-1.5 w-5 -translate-x-1/2 translate-y-1/2 rounded-full bg-black/35 blur-[2px]" />
        <span
          className="relative grid size-11 place-items-center rounded-full rounded-br-none text-white shadow-float ring-4 ring-white/90 [transform:rotate(45deg)] dark:ring-black/40"
          style={{ background: color }}
        >
          <CategoryIcon icon={icon} className="size-5 [transform:rotate(-45deg)]" />
        </span>
      </span>
      <span className="glass absolute bottom-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground shadow-card transition group-hover:bg-surface-2">
        <ExternalLink className="size-3.5" /> Abrir no mapa
      </span>
    </a>
  );
}

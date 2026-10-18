"use client";

import { getCurrentPosition, isNativeApp, LocationError } from "@/lib/native";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Marker } from "maplibre-gl";
import { BookmarkPlus, Check, Crosshair, Loader2, LocateFixed, MapPin, Search, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useMap } from "@/components/map/use-map";
import { BR_STATES, CITY_ZOOM, DEFAULT_MAP_VIEW } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { formatCep } from "@/lib/validation/event";
import { createVenueAction } from "@/server/organizations/actions";

export interface LocationValue {
  venueId: string;
  venueName: string;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
}

export interface SavedVenue {
  id: string;
  name: string;
  address: string;
  neighborhood: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
}

interface GeoResult {
  label: string;
  name: string | null;
  address: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  lat: number;
  lng: number;
  kind: "place" | "address" | "city" | "region";
}

interface LocationPickerProps {
  value: LocationValue;
  onChange: (patch: Partial<LocationValue>) => void;
  errors?: Record<string, string | undefined>;
  /** Locais salvos para reutilizar (omitido no cadastro de locais). */
  venues?: SavedVenue[];
  organizationId?: string;
  onVenueSaved?: (venue: SavedVenue) => void;
  /** Cor e ícone do pino (categoria do evento). */
  color?: string;
  idPrefix?: string;
}

const PIN_ZOOM = 16;

function venueToValue(v: SavedVenue): LocationValue {
  return {
    venueId: v.id,
    venueName: v.name,
    address: v.address,
    neighborhood: v.neighborhood ?? "",
    city: v.city,
    state: v.state ?? "",
    postalCode: v.postalCode ?? "",
    lat: v.lat,
    lng: v.lng,
  };
}

/**
 * Seletor de local: busca de endereço, mapa com pino arrastável (clique para
 * posicionar), "Usar minha localização", geocodificação reversa e campos
 * sempre editáveis. Sem geocodificador, o pino continua funcionando manualmente.
 */
export function LocationPicker({ value, onChange, errors = {}, venues, organizationId, onVenueSaved, color = "#7C5CFF", idPrefix }: LocationPickerProps) {
  const autoId = useId();
  const pid = idPrefix ?? `loc-${autoId}`;
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<Marker | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  const hasPin = value.lat != null && value.lng != null;
  const [initialView] = useState(() =>
    hasPin ? { lat: value.lat!, lng: value.lng!, zoom: PIN_ZOOM } : { lat: DEFAULT_MAP_VIEW.lat, lng: DEFAULT_MAP_VIEW.lng, zoom: DEFAULT_MAP_VIEW.zoom },
  );
  const { map, degraded } = useMap(mapRef, {
    center: initialView,
    zoom: initialView.zoom,
    navigationControl: true,
    cooperativeGestures: true,
  });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [geoOff, setGeoOff] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<{ message: string; plan: boolean } | null>(null);

  /** Preenche só os campos vazios (depois de soltar o pino). */
  const reverse = useCallback(
    async (lat: number, lng: number) => {
      setReversing(true);
      try {
        const res = await fetch(`/api/geocode/reverse?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`);
        const body = (await res.json().catch(() => ({}))) as { result?: GeoResult | null; error?: string };
        if (res.status === 503) {
          setGeoOff(body.error ?? "A busca de endereços está indisponível no momento.");
          return;
        }
        const r = body.result;
        if (!res.ok || !r) return;
        const v = valueRef.current;
        const patch: Partial<LocationValue> = {};
        if (!v.address && r.address) patch.address = r.address;
        if (!v.neighborhood && r.neighborhood) patch.neighborhood = r.neighborhood;
        if (!v.city && r.city) patch.city = r.city;
        if (!v.state && r.state && (BR_STATES as readonly string[]).includes(r.state)) patch.state = r.state;
        if (!v.postalCode && r.postalCode) patch.postalCode = formatCep(r.postalCode);
        if (!v.venueName && r.name && r.kind === "place") patch.venueName = r.name;
        if (Object.keys(patch).length) onChange(patch);
      } catch {
        // Sem rede: os campos continuam editáveis.
      } finally {
        setReversing(false);
      }
    },
    [onChange],
  );

  const placePin = useCallback(
    (lat: number, lng: number, opts: { reverse?: boolean; fly?: boolean } = {}) => {
      onChange({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), venueId: "" });
      if (opts.fly && map) map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), PIN_ZOOM), duration: 800 });
      if (opts.reverse) void reverse(lat, lng);
    },
    [map, onChange, reverse],
  );

  // O container pode nascer oculto (etapas do editor no celular): ajusta o mapa quando aparece.
  useEffect(() => {
    const el = mapRef.current;
    if (!map || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);

  // Clique no mapa posiciona o pino.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: { lngLat: { lat: number; lng: number } }) => placePin(e.lngLat.lat, e.lngLat.lng, { reverse: true });
    map.on("click", onClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
    };
  }, [map, placePin]);

  // Pino arrastável sincronizado com o valor.
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    if (value.lat == null || value.lng == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const lat = value.lat;
    const lng = value.lng;
    (async () => {
      if (markerRef.current) {
        markerRef.current.setLngLat([lng, lat]);
        return;
      }
      const maplibregl = (await import("maplibre-gl")).default;
      if (cancelled || markerRef.current) return;
      const el = document.createElement("div");
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "Pino do local (arraste para ajustar)");
      el.className = "cursor-grab active:cursor-grabbing";
      el.innerHTML = `<span style="background:${color.replace(/[^#0-9a-fA-F]/g, "")}" class="block size-10 rounded-full rounded-br-none shadow-float ring-4 ring-white/90 [transform:rotate(45deg)] dark:ring-black/40"><span class="absolute inset-0 m-auto block size-3 rounded-full bg-white"></span></span>`;
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom", offset: [0, -8] }).setLngLat([lng, lat]).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLngLat();
        placePin(p.lat, p.lng, { reverse: true });
      });
      markerRef.current = marker;
    })();
    return () => {
      cancelled = true;
    };
  }, [map, value.lat, value.lng, color, placePin]);

  useEffect(
    () => () => {
      markerRef.current?.remove();
      markerRef.current = null;
    },
    [],
  );

  // Busca com debounce.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const v = valueRef.current;
        const near = v.lat != null && v.lng != null ? `&lat=${v.lat}&lng=${v.lng}` : "";
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}${near}`, { signal: ctrl.signal });
        const body = (await res.json().catch(() => ({}))) as { results?: GeoResult[]; error?: string };
        if (res.status === 503) {
          setGeoOff(body.error ?? "A busca de endereços está indisponível no momento.");
          setResults([]);
        } else if (!res.ok) {
          setResults([]);
          if (res.status === 429) toast.error(body.error ?? "Muitas buscas seguidas. Aguarde um instante.");
        } else {
          setResults(body.results ?? []);
          setActive(-1);
          setOpen(true);
        }
      } catch {
        // abortado ou sem rede
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  function choose(r: GeoResult) {
    const v = valueRef.current;
    onChange({
      venueId: "",
      venueName: v.venueName || (r.kind === "place" && r.name ? r.name : v.venueName),
      address: r.address || v.address,
      neighborhood: r.neighborhood ?? v.neighborhood,
      city: r.city ?? v.city,
      state: r.state && (BR_STATES as readonly string[]).includes(r.state) ? r.state : v.state,
      postalCode: r.postalCode ? formatCep(r.postalCode) : v.postalCode,
      lat: r.lat,
      lng: r.lng,
    });
    map?.flyTo({ center: [r.lng, r.lat], zoom: r.kind === "city" || r.kind === "region" ? CITY_ZOOM : PIN_ZOOM, duration: 900 });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function useMyLocation() {
    setLocating(true);
    getCurrentPosition({ timeoutMs: 12_000, highAccuracy: true })
      .then((pos) => placePin(pos.lat, pos.lng, { reverse: true, fly: true }))
      .catch((err: unknown) => {
        toast.error(
          err instanceof LocationError && err.code === "denied"
            ? isNativeApp()
              ? "Permita o acesso à localização nos ajustes do aparelho."
              : "Permita o acesso à localização nas configurações do navegador."
            : err instanceof Error
              ? err.message
              : "Não foi possível obter sua localização agora.",
        );
      })
      .finally(() => setLocating(false));
  }

  function applyVenue(v: SavedVenue) {
    onChange(venueToValue(v));
    map?.flyTo({ center: [v.lng, v.lat], zoom: PIN_ZOOM, duration: 800 });
  }

  const canSave = Boolean(organizationId && !value.venueId && value.venueName.trim().length >= 2 && value.address.trim().length >= 3 && value.city.trim().length >= 2 && hasPin);

  function saveVenue() {
    if (!organizationId) return;
    setSaveError(null);
    startSaving(async () => {
      const res = await createVenueAction({
        organizationId,
        values: {
          name: value.venueName,
          address: value.address,
          neighborhood: value.neighborhood,
          city: value.city,
          state: value.state,
          postalCode: value.postalCode,
          lat: value.lat,
          lng: value.lng,
        },
      });
      if (res.status === "success" && res.data) {
        onVenueSaved?.(res.data);
        onChange({ venueId: res.data.id });
        toast.success("Local salvo. Ele aparece em “Locais salvos” nos próximos eventos.");
      } else if (res.status === "error") {
        setSaveError({ message: res.message, plan: res.fieldErrors?._code === "PLAN_LIMIT" });
      }
    });
  }

  const field = (name: keyof LocationValue) => ({
    id: `${pid}-${name}`,
    "aria-invalid": errors[name] ? (true as const) : undefined,
    "aria-describedby": errors[name] ? `${pid}-${name}-error` : undefined,
  });

  const listId = `${pid}-results`;

  return (
    <div className="flex flex-col gap-5">
      {venues && venues.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Locais salvos</span>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {venues.map((v) => {
              const selected = value.venueId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => applyVenue(v)}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-14 max-w-64 shrink-0 items-center gap-2.5 rounded-2xl border px-3.5 py-2 text-left transition",
                    selected ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", selected ? "bg-primary text-white" : "bg-surface-2 text-muted-foreground")}>
                    {selected ? <Check className="size-4" /> : <MapPin className="size-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{v.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{[v.neighborhood, v.city].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative">
        <label htmlFor={`${pid}-search`} className="sr-only">
          Buscar endereço ou local
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={`${pid}-search`}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={geoOff ? "Busca indisponível — use o mapa" : "Buscar endereço, local ou CEP"}
          value={query}
          disabled={Boolean(geoOff)}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setSearching(v.trim().length >= 3);
            if (v.trim().length < 3) setResults([]);
          }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="pr-11 pl-11"
        />
        {searching ? (
          <Loader2 className="absolute top-1/2 right-4 size-[18px] -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Buscando" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setSearching(false);
            }}
            aria-label="Limpar busca" className="absolute top-1/2 right-1.5 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-surface-2">
            <X className="size-4" />
          </button>
        ) : null}
        {open && query.trim().length >= 3 && !searching && (
          <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-elevated p-1.5 shadow-float">
            {results.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">Nada encontrado. Tente o nome da rua com o número e a cidade — ou marque no mapa.</li>
            ) : (
              results.map((r, i) => (
                <li
                  key={`${r.lat},${r.lng},${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(r)}
                  className={cn("flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5", i === active ? "bg-surface-2" : "hover:bg-surface-2")}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{r.name ?? r.address ?? r.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.label}</span>
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {geoOff && (
        <div role="status" className="flex items-start gap-2.5 rounded-2xl border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="text-foreground/85">
            A busca de endereços está indisponível agora. Toque no mapa (ou use sua localização) para posicionar o pino e preencha o endereço abaixo.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div
          className={cn(
            "relative h-64 overflow-hidden rounded-3xl border bg-[var(--map-bg)] sm:h-80",
            errors.location ? "border-danger" : "border-border",
          )}
        >
          {/* size-full (não absolute): o CSS do MapLibre força position: relative no container. */}
          <div ref={mapRef} className="size-full" />
          {!hasPin && (
            <div className="glass pointer-events-none absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shadow-card">
              <Crosshair className="size-4 text-primary" /> Toque no mapa para marcar o local
            </div>
          )}
          {degraded && hasPin && (
            <div className="glass pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              Mapa simplificado (sem conexão com o provedor)
            </div>
          )}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            <Button type="button" size="sm" variant="glass" onClick={useMyLocation} loading={locating} aria-label="Usar minha localização">
              <LocateFixed /> <span className="hidden sm:inline">Minha localização</span>
            </Button>
          </div>
        </div>
        <div className="flex min-h-5 items-center justify-between gap-3 text-[13px]">
          {errors.location ? (
            <p id={`${pid}-location-error`} role="alert" className="font-medium text-danger">
              {errors.location}
            </p>
          ) : (
            <p className="text-muted-foreground">{hasPin ? "Arraste o pino para ajustar a posição exata." : "O pino define onde o evento aparece no mapa."}</p>
          )}
          {reversing && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Buscando endereço…
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do local" htmlFor={`${pid}-venueName`} error={errors.venueName} className="sm:col-span-2">
          <Input {...field("venueName")} value={value.venueName} maxLength={120} placeholder="Ex.: Teatro Municipal, Praça da Liberdade" onChange={(e) => onChange({ venueName: e.target.value, venueId: "" })} />
        </Field>
        <Field label="Endereço" htmlFor={`${pid}-address`} error={errors.address} className="sm:col-span-2">
          <Input {...field("address")} value={value.address} maxLength={200} autoComplete="street-address" placeholder="Rua, número" onChange={(e) => onChange({ address: e.target.value, venueId: "" })} />
        </Field>
        <Field label="Bairro" htmlFor={`${pid}-neighborhood`} error={errors.neighborhood} optional>
          <Input {...field("neighborhood")} value={value.neighborhood} maxLength={80} onChange={(e) => onChange({ neighborhood: e.target.value })} />
        </Field>
        <Field label="CEP" htmlFor={`${pid}-postalCode`} error={errors.postalCode} optional>
          <Input {...field("postalCode")} value={value.postalCode} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" onChange={(e) => onChange({ postalCode: formatCep(e.target.value) })} />
        </Field>
        <Field label="Cidade" htmlFor={`${pid}-city`} error={errors.city}>
          <Input {...field("city")} value={value.city} maxLength={80} autoComplete="address-level2" onChange={(e) => onChange({ city: e.target.value })} />
        </Field>
        <Field label="UF" htmlFor={`${pid}-state`} error={errors.state}>
          <Select {...field("state")} value={value.state} onChange={(e) => onChange({ state: e.target.value })}>
            <option value="">Selecione</option>
            {BR_STATES.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {organizationId && (canSave || saveError) && (
        <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border-strong p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-semibold">Vai usar este local de novo?</p>
            <p className="text-muted-foreground">Salve para preencher tudo com um toque nos próximos eventos.</p>
            {saveError && (
              <p role="alert" className="mt-1.5 font-medium text-danger">
                {saveError.message}{" "}
                {saveError.plan && (
                  <Link href="/painel/plano" className="underline underline-offset-2">
                    Ver planos
                  </Link>
                )}
              </p>
            )}
          </div>
          {canSave && (
            <Button type="button" variant="secondary" size="sm" onClick={saveVenue} loading={saving} className="shrink-0">
              <BookmarkPlus /> Salvar este local
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

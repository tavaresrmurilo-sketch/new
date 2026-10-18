"use client";

import { ArrowLeft, ArrowUpRight, BadgeCheck, Building2, Clock, LocateFixed, MapPin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CategoryIcon } from "@/components/events/category-icon";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/misc";
import type { CategoryDTO } from "@/lib/categories";
import { normalizeQuery } from "@/lib/explore-params";
import { eventWhenLabel } from "@/lib/format";
import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { ApiError, getJson, isAbort, type GeoPlace, type SuggestResponse } from "./api";
import { clearRecentSearches, removeRecentSearch, useRecentSearches } from "./browser";

export interface SearchActions {
  /** Aplica a busca textual (e ajusta o mapa aos resultados). */
  onSubmitQuery: (q: string) => void;
  onPickCategory: (slug: string) => void;
  onPickPlace: (place: GeoPlace) => void;
  onNearMe?: () => void;
}

type Option =
  | { kind: "query"; key: string; q: string }
  | { kind: "recent"; key: string; q: string }
  | { kind: "event"; key: string; data: SuggestResponse["events"][number] }
  | { kind: "organizer"; key: string; data: SuggestResponse["organizers"][number] }
  | { kind: "category"; key: string; data: SuggestResponse["categories"][number] }
  | { kind: "place"; key: string; data: GeoPlace };

const SUGGEST_DEBOUNCE_MS = 180;
const GEOCODE_DEBOUNCE_MS = 380;
const EMPTY_SUGGEST: SuggestResponse = { events: [], organizers: [], categories: [] };

/** Sugestões em tempo real (eventos, organizadores, categorias) + cidades/endereços pelo geocodificador. */
function useSuggestions(query: string, near: LatLng | null) {
  const q = normalizeQuery(query);
  const suggestKey = q.length >= 2 ? q.toLowerCase() : null;
  const geoKey = q.length >= 3 ? q.toLowerCase() : null;
  const [suggest, setSuggest] = useState<{ key: string | null; data: SuggestResponse }>({ key: null, data: EMPTY_SUGGEST });
  const [geo, setGeo] = useState<{ key: string | null; places: GeoPlace[]; unavailable: boolean }>({ key: null, places: [], unavailable: false });
  const nearRef = useRef(near);
  useEffect(() => {
    nearRef.current = near;
  }, [near]);

  useEffect(() => {
    if (!suggestKey) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      getJson<SuggestResponse>(`/api/search/suggest?q=${encodeURIComponent(suggestKey)}`, ctrl.signal).then(
        (data) => setSuggest({ key: suggestKey, data }),
        (err) => {
          if (!isAbort(err) && !ctrl.signal.aborted) setSuggest({ key: suggestKey, data: EMPTY_SUGGEST });
        },
      );
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [suggestKey]);

  useEffect(() => {
    if (!geoKey) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      const n = nearRef.current;
      const nearQs = n ? `&lat=${n.lat.toFixed(3)}&lng=${n.lng.toFixed(3)}` : "";
      getJson<{ results: GeoPlace[] }>(`/api/geocode?q=${encodeURIComponent(geoKey)}${nearQs}`, ctrl.signal).then(
        (data) => setGeo({ key: geoKey, places: (data.results ?? []).slice(0, 4), unavailable: false }),
        (err) => {
          if (isAbort(err) || ctrl.signal.aborted) return;
          // 503 = geocodificador desligado/fora do ar; 429 = muitas buscas: sem lugares, sem drama
          setGeo({ key: geoKey, places: [], unavailable: err instanceof ApiError && (err.status === 503 || err.status === 0) });
        },
      );
    }, GEOCODE_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [geoKey]);

  return {
    data: suggestKey && suggest.key === suggestKey ? suggest.data : EMPTY_SUGGEST,
    places: geoKey && geo.key === geoKey ? geo.places : [],
    placesUnavailable: Boolean(geoKey && geo.key === geoKey && geo.unavailable),
    loading: Boolean((suggestKey && suggest.key !== suggestKey) || (geoKey && geo.key !== geoKey)),
  };
}

function useSearchController({ initialQuery, near, actions, onDone }: { initialQuery: string; near: LatLng | null; actions: SearchActions; onDone: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(-1);
  const recent = useRecentSearches();
  const { data, places, placesUnavailable, loading } = useSuggestions(query, near);
  const q = normalizeQuery(query);

  const options = useMemo<Option[]>(() => {
    if (!q) return recent.map((r) => ({ kind: "recent" as const, key: `r:${r}`, q: r }));
    return [
      { kind: "query" as const, key: `q:${q}`, q },
      ...data.events.map((e) => ({ kind: "event" as const, key: `e:${e.id}`, data: e })),
      ...data.organizers.map((o) => ({ kind: "organizer" as const, key: `o:${o.id}`, data: o })),
      ...data.categories.map((c) => ({ kind: "category" as const, key: `c:${c.slug}`, data: c })),
      ...places.map((p, i) => ({ kind: "place" as const, key: `p:${i}:${p.lat},${p.lng}`, data: p })),
    ];
  }, [q, recent, data, places]);

  const activeIndex = active >= options.length ? -1 : active;

  const pick = (o: Option) => {
    switch (o.kind) {
      case "query":
      case "recent":
        actions.onSubmitQuery(o.q);
        break;
      case "event":
        router.push(`/evento/${o.data.slug}`);
        break;
      case "organizer":
        router.push(`/organizador/${o.data.slug}`);
        break;
      case "category":
        actions.onPickCategory(o.data.slug);
        break;
      case "place":
        actions.onPickPlace(o.data);
        break;
    }
    onDone();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(options.length ? (activeIndex + 1) % options.length : -1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(options.length ? (activeIndex <= 0 ? options.length - 1 : activeIndex - 1) : -1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && options[activeIndex]) pick(options[activeIndex]);
      else {
        actions.onSubmitQuery(q);
        onDone();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (query) setQuery("");
      else onDone();
    }
  };

  return {
    query,
    setQuery: (v: string) => {
      setQuery(v);
      setActive(-1);
    },
    q,
    options,
    activeIndex,
    setActive,
    pick,
    onKeyDown,
    loading,
    placesUnavailable,
    recent,
  };
}

type Controller = ReturnType<typeof useSearchController>;

function optionId(listId: string, i: number) {
  return `${listId}-opt-${i}`;
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
      <p className="text-xs font-bold tracking-wide text-subtle-foreground uppercase">{children}</p>
      {action}
    </div>
  );
}

function OptionRow({
  id,
  active,
  onPick,
  onHover,
  icon,
  title,
  subtitle,
  trailing,
}: {
  id: string;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
  icon: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      onMouseMove={onHover}
      className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors", active ? "bg-surface-2" : "hover:bg-surface-2/70")}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-[18px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing}
    </div>
  );
}

function Results({
  c,
  listId,
  categories,
  actions,
  onDone,
}: {
  c: Controller;
  listId: string;
  categories: CategoryDTO[];
  actions: SearchActions;
  onDone: () => void;
}) {
  const props = (o: Option) => {
    const idx = c.options.indexOf(o);
    return {
      id: optionId(listId, idx),
      active: c.activeIndex === idx,
      onPick: () => c.pick(o),
      onHover: () => c.setActive(idx),
    };
  };
  const ofKind = <K extends Option["kind"]>(kind: K) => c.options.filter((o): o is Extract<Option, { kind: K }> => o.kind === kind);

  if (!c.q) {
    const recent = ofKind("recent");
    return (
      <div>
        {actions.onNearMe && (
          <button
            type="button"
            onClick={() => {
              actions.onNearMe?.();
              onDone();
            }}
            className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-surface-2"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
              <LocateFixed className="size-[18px]" />
            </span>
            <span>
              <span className="block text-[15px] font-semibold">Perto de mim</span>
              <span className="block text-[13px] text-muted-foreground">Usar minha localização agora</span>
            </span>
          </button>
        )}
        {recent.length > 0 && (
          <>
            <SectionTitle
              action={
                <button type="button" onClick={clearRecentSearches} className="rounded-full px-2 py-1 text-xs font-semibold text-primary hover:underline">
                  Limpar
                </button>
              }
            >
              Buscas recentes
            </SectionTitle>
            <div role="listbox" id={listId} aria-label="Buscas recentes">
              {recent.map((o) => (
                <OptionRow
                  key={o.key}
                  {...props(o)}
                  icon={<Clock />}
                  title={o.q}
                  trailing={
                    <button
                      type="button"
                      aria-label={`Remover “${o.q}” das buscas recentes`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentSearch(o.q);
                      }}
                      className="grid size-9 shrink-0 place-items-center rounded-full text-subtle-foreground hover:bg-surface-3 hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  }
                />
              ))}
            </div>
          </>
        )}
        {categories.length > 0 && (
          <>
            <SectionTitle>Explorar por categoria</SectionTitle>
            <div className="flex flex-wrap gap-2 px-3 pb-4">
              {categories.map((cat) => (
                <button
                  key={cat.slug}
                  type="button"
                  onClick={() => {
                    actions.onPickCategory(cat.slug);
                    onDone();
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-semibold transition hover:border-border-strong"
                >
                  <span style={{ color: cat.color }}>
                    <CategoryIcon icon={cat.icon} className="size-4" />
                  </span>
                  {cat.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const [queryOption] = ofKind("query");
  const events = ofKind("event");
  const orgs = ofKind("organizer");
  const cats = ofKind("category");
  const places = ofKind("place");

  return (
    <div role="listbox" id={listId} aria-label="Sugestões de busca" className="pb-3">
      {queryOption && (
        <OptionRow
          {...props(queryOption)}
          icon={<Search />}
          title={
            <>
              Buscar “<span className="text-primary">{c.q}</span>”
            </>
          }
          subtitle="Ver todos os resultados no mapa"
          trailing={c.loading ? <Spinner className="size-4 text-subtle-foreground" /> : undefined}
        />
      )}
      {events.length > 0 && (
        <div role="group" aria-label="Eventos">
          <SectionTitle>Eventos</SectionTitle>
          {events.map((o) => (
            <OptionRow
              key={o.key}
              {...props(o)}
              icon={
                <span style={{ color: o.data.category.color }}>
                  <CategoryIcon icon={o.data.category.icon} />
                </span>
              }
              title={o.data.title}
              subtitle={`${eventWhenLabel(new Date(o.data.startsAt), new Date(o.data.endsAt), undefined, o.data.timezone)} · ${o.data.place}`}
              trailing={<ArrowUpRight className="size-4 shrink-0 text-subtle-foreground" />}
            />
          ))}
        </div>
      )}
      {orgs.length > 0 && (
        <div role="group" aria-label="Organizadores">
          <SectionTitle>Organizadores</SectionTitle>
          {orgs.map((o) => (
            <OptionRow
              key={o.key}
              {...props(o)}
              icon={o.data.logoUrl ? <Avatar name={o.data.name} src={o.data.logoUrl} size="sm" square className="size-10" /> : <Building2 />}
              title={
                <span className="inline-flex max-w-full items-center gap-1">
                  <span className="truncate">{o.data.name}</span>
                  {o.data.verified && <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="verificado" />}
                </span>
              }
              subtitle={[
                o.data.upcomingCount ? `${o.data.upcomingCount} ${o.data.upcomingCount === 1 ? "evento" : "eventos"} em breve` : "Sem eventos programados",
                o.data.city,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={<ArrowUpRight className="size-4 shrink-0 text-subtle-foreground" />}
            />
          ))}
        </div>
      )}
      {cats.length > 0 && (
        <div role="group" aria-label="Categorias">
          <SectionTitle>Categorias</SectionTitle>
          {cats.map((o) => (
            <OptionRow
              key={o.key}
              {...props(o)}
              icon={
                <span style={{ color: o.data.color }}>
                  <CategoryIcon icon={o.data.icon} />
                </span>
              }
              title={o.data.name}
              subtitle="Filtrar o mapa por esta categoria"
            />
          ))}
        </div>
      )}
      {(places.length > 0 || c.placesUnavailable) && (
        <div role="group" aria-label="Cidades e endereços">
          <SectionTitle>Cidades e endereços</SectionTitle>
          {c.placesUnavailable ? (
            <p className="px-3 pb-2 text-[13px] text-muted-foreground">A busca de cidades e endereços está indisponível no momento. Você ainda pode mover o mapa até lá.</p>
          ) : (
            places.map((o) => (
              <OptionRow
                key={o.key}
                {...props(o)}
                icon={<MapPin />}
                title={o.data.name ?? (o.data.kind === "city" ? (o.data.city ?? o.data.label) : o.data.address)}
                subtitle={[o.data.kind === "city" ? null : o.data.neighborhood, o.data.city && o.data.state ? `${o.data.city} – ${o.data.state}` : (o.data.city ?? o.data.state)]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface SearchProps {
  initialQuery: string;
  near: LatLng | null;
  categories: CategoryDTO[];
  actions: SearchActions;
}

/** Busca em tela cheia (celular). */
export function SearchOverlay({ onClose, ...props }: SearchProps & { onClose: () => void }) {
  const listId = useId();
  const c = useSearchController({ initialQuery: props.initialQuery, near: props.near, actions: props.actions, onDone: onClose });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="Buscar no Mixtour" className="fixed inset-0 z-[70] flex flex-col bg-background animate-fade-in">
      <div className="safe-top border-b border-border">
        <div className="flex items-center gap-2 px-3 py-3">
          <button type="button" onClick={onClose} aria-label="Voltar ao mapa" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2">
            <ArrowLeft className="size-6" />
          </button>
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle-foreground" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={c.options.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={c.activeIndex >= 0 ? optionId(listId, c.activeIndex) : undefined}
              aria-label="Buscar eventos, organizadores, categorias ou lugares"
              placeholder="Eventos, lugares, artistas…"
              maxLength={80}
              value={c.query}
              onChange={(e) => c.setQuery(e.target.value)}
              onKeyDown={c.onKeyDown}
              className="h-12 w-full rounded-full border border-input bg-surface pr-12 pl-12 text-base outline-none transition placeholder:text-subtle-foreground focus:border-ring focus:ring-4 focus:ring-ring/15 [&::-webkit-search-cancel-button]:hidden"
            />
            {c.query && (
              <button
                type="button"
                onClick={() => {
                  c.setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Limpar texto"
                className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Results c={c} listId={listId} categories={props.categories} actions={props.actions} onDone={onClose} />
      </div>
    </div>
  );
}

/** Campo de busca com sugestões em dropdown (desktop). */
export function SearchBox({ committedQuery, onClear, ...props }: SearchProps & { committedQuery: string; onClear: () => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const c = useSearchController({
    initialQuery: props.initialQuery,
    near: props.near,
    actions: props.actions,
    onDone: () => {
      setOpen(false);
      inputRef.current?.blur();
    },
  });

  // "/" foca a busca (atalho comum em apps de mapa)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const showDropdown = open && (c.q.length > 0 || c.recent.length > 0 || props.categories.length > 0);

  return (
    <div ref={boxRef} className="relative">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-subtle-foreground" />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showDropdown && c.activeIndex >= 0 ? optionId(listId, c.activeIndex) : undefined}
        aria-label="Buscar eventos, organizadores, categorias ou lugares"
        placeholder="Buscar eventos, lugares, artistas…"
        maxLength={80}
        value={c.query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          c.setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !c.query) {
            setOpen(false);
            inputRef.current?.blur();
            return;
          }
          c.onKeyDown(e);
        }}
        className="h-12 w-full rounded-full border border-input bg-surface pr-24 pl-12 text-[15px] outline-none transition placeholder:text-subtle-foreground focus:border-ring focus:ring-4 focus:ring-ring/15 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
        {c.query ? (
          <button
            type="button"
            onClick={() => {
              c.setQuery("");
              if (committedQuery) onClear();
              inputRef.current?.focus();
            }}
            aria-label="Limpar busca"
            className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="size-[18px]" />
          </button>
        ) : (
          <kbd aria-hidden className="mr-2 rounded-md border border-border-strong bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            /
          </kbd>
        )}
      </div>
      {showDropdown && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-40 max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain rounded-3xl border border-border bg-elevated p-1.5 shadow-float animate-fade-in">
          <Results c={c} listId={listId} categories={props.categories} actions={props.actions} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

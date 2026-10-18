"use client";

import { ArrowDownUp, Check, ChevronDown, Info, List, LoaderCircle, LocateFixed, Map as MapIcon, Minus, Plus, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { ExploreMap, type ExploreMapHandle, type ExploreMapPopup, type MapInsets } from "@/components/map/explore-map";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { Switch } from "@/components/ui/switch";
import type { CategoryDTO } from "@/lib/categories";
import { CITY_ZOOM, DEFAULT_MAP_VIEW } from "@/lib/constants";
import {
  activeFilterCount,
  bboxContains,
  bboxParam,
  clearFilters,
  hasRestrictingFilters,
  MIN_ZOOM,
  normalizeQuery,
  padBBox,
  serializeExploreParams,
  SORT_OPTIONS,
  toggleInList,
  viewToBBox,
  whenChipLabel,
  type ExploreFilters,
  type ExploreMode,
  type ExploreSort,
  type MapView,
} from "@/lib/explore-params";
import { formatNumber } from "@/lib/format";
import type { BBox, LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { getJson, type GeoPlace, type MapPointsResponse } from "./api";
import { BottomSheet, type SheetSnap } from "./bottom-sheet";
import { addRecentSearch, readStoredView, storeView, useAutoUpdatePreference, useIsDesktop, useWebGLSupport } from "./browser";
import { EventResults } from "./event-results";
import { CategoryChips, ChipDivider, DateChips, FiltersButton, ScrollRow } from "./filter-chips";
import { DateDialog, FiltersDialog } from "./filters-dialog";
import { SearchBox, SearchOverlay, type SearchActions } from "./search";
import { SelectedEventPopupCard, SelectedEventSheetCard, SpotList } from "./selected-event";
import { useEventCards, useEventList, useMapPoints, pointsUrl, type InitialList } from "./use-explore-data";
import { useGeolocation } from "./use-geolocation";

export interface ExploreViewer {
  name: string;
  avatarUrl: string | null;
}

export interface ExploreScreenProps {
  categories: CategoryDTO[];
  initialFilters: ExploreFilters;
  /** Posição vinda da URL (tem prioridade). */
  urlView: MapView | null;
  /** Cidade/coordenadas salvas no perfil do usuário logado. */
  homeView: MapView | null;
  initialMode: ExploreMode;
  initialList: InitialList | null;
  viewer: ExploreViewer | null;
  /** Título acessível da página (reflete os filtros). */
  title: string;
}

/** Altura do topo flutuante no celular (sem a safe area): pílula 48 + chips 44 + espaçamentos. */
const MOBILE_TOP = 128;
const MOBILE_PEEK_MIN = 132;
const PLACE_ZOOM: Record<GeoPlace["kind"], number> = { city: CITY_ZOOM, region: 7, address: 16, place: 16 };

function countLabel(total: number, loading: boolean, firstLoad: boolean, q: string): string {
  if (firstLoad) return "Procurando eventos…";
  if (q) {
    if (!total) return loading ? "Buscando…" : `Nenhum resultado para “${q}”`;
    return `${formatNumber(total)} ${total === 1 ? "resultado" : "resultados"} para “${q}”`;
  }
  if (!total) return loading ? "Procurando eventos…" : "Nenhum evento nesta área";
  return `${formatNumber(total)} ${total === 1 ? "evento" : "eventos"} nesta área`;
}

function filtersSummary(filters: ExploreFilters, categories: CategoryDTO[]): string {
  const parts: string[] = [];
  parts.push(filters.when === "upcoming" ? "Próximos eventos" : whenChipLabel(filters.when));
  const names = filters.cats.map((c) => categories.find((x) => x.slug === c)?.name).filter(Boolean) as string[];
  parts.push(names.length === 0 ? "todas as categorias" : names.length <= 2 ? names.join(", ") : `${names.length} categorias`);
  if (filters.free) parts.push("grátis");
  if (filters.access.length) parts.push("acessível");
  return parts.join(" · ");
}

function SortMenu({ value, onChange, compact }: { value: ExploreSort; onChange: (v: ExploreSort) => void; compact?: boolean }) {
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-[13px] font-semibold text-foreground transition hover:bg-surface-2"
            aria-label={`Ordenar por: ${current.label}`}
          >
            <ArrowDownUp className="size-4 text-muted-foreground" />
            {current.label}
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            aria-label={`Ordenar por: ${current.label}`}
          >
            <span className="text-subtle-foreground">Ordenar:</span> <span className="text-foreground">{current.label}</span>
            <ChevronDown className="size-4" />
          </button>
        )}
      </DropdownTrigger>
      <DropdownContent className="w-72">
        {SORT_OPTIONS.map((o) => (
          <DropdownItem key={o.value} onSelect={() => onChange(o.value)} className="items-start">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center">{o.value === value && <Check className="!text-primary" />}</span>
            <span>
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-xs text-muted-foreground">{o.description}</span>
            </span>
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

function DegradedNotice({ className }: { className?: string }) {
  return (
    <div role="status" className={cn("glass pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground shadow-float", className)}>
      <Info className="size-4 shrink-0 text-warning" />
      Mapa base indisponível no momento — os eventos continuam no lugar.
    </div>
  );
}

function RoundButton({ label, onClick, children, active, busy, className }: { label: string; onClick: () => void; children: ReactNode; active?: boolean; busy?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      aria-busy={busy || undefined}
      className={cn(
        "glass grid size-12 place-items-center rounded-full border border-border shadow-float transition active:scale-95 [&_svg]:size-[22px]",
        active ? "text-info" : "text-foreground hover:bg-surface-2",
        className,
      )}
    >
      {busy ? <LoaderCircle className="animate-spin" /> : children}
    </button>
  );
}

export function ExploreScreen(props: ExploreScreenProps) {
  const { categories, viewer } = props;
  const isDesktop = useIsDesktop();
  const webgl = useWebGLSupport();
  const mapRef = useRef<ExploreMapHandle>(null);

  const [filters, setFilters] = useState<ExploreFilters>(props.initialFilters);
  const [initialView] = useState<MapView>(() => props.urlView ?? readStoredView() ?? props.homeView ?? { ...DEFAULT_MAP_VIEW });
  const [viewBox, setViewBox] = useState<BBox | null>(null);
  const [pointsBox, setPointsBox] = useState<BBox | null>(null);
  const [listBox, setListBox] = useState<BBox | null>(null);
  const [zoom, setZoom] = useState(initialView.zoom);
  const [urlView, setUrlView] = useState<MapView | null>(props.urlView);
  const [snap, setSnap] = useState<SheetSnap>(props.initialMode === "lista" ? "full" : "peek");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spot, setSpot] = useState<string[] | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [sheetCover, setSheetCover] = useState(MOBILE_PEEK_MIN + 64);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [globalSearch, setGlobalSearch] = useState<{ q: string; total: number } | null>(null);
  const [autoUpdate, setAutoUpdate] = useAutoUpdatePreference();
  const geo = useGeolocation();

  const near: LatLng | null = useMemo(() => (geo.position ? { lat: geo.position.lat, lng: geo.position.lng } : null), [geo.position]);
  const desktop = isDesktop === true;

  // Sem WebGL o mapa não abre: a lista usa a área inicial aproximada.
  const fallbackBox = useMemo(() => (webgl ? null : viewToBBox(initialView, 1000, 800)), [webgl, initialView]);
  const effectiveListBox = listBox ?? fallbackBox;

  const points = useMapPoints(pointsBox, filters);
  const list = useEventList(effectiveListBox, near, filters, { enabled: effectiveListBox !== null, initial: props.initialList });

  const firstMove = useRef(true);
  const syncListOnNextMove = useRef(false);
  const truncatedRef = useRef(false);
  const storeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fitSeq = useRef(0);

  useEffect(() => {
    truncatedRef.current = points.truncated;
  }, [points.truncated]);

  // ───────── busca global: ajusta o mapa aos resultados ─────────
  const fitToQuery = useCallback((q: string, base: ExploreFilters) => {
    const seq = ++fitSeq.current;
    if (!q) {
      setGlobalSearch(null);
      return;
    }
    getJson<MapPointsResponse>(pointsUrl(null, { ...base, q })).then(
      (res) => {
        if (seq !== fitSeq.current) return;
        setGlobalSearch({ q, total: res.total });
        if (res.points.length) {
          syncListOnNextMove.current = true;
          mapRef.current?.fitPoints(res.points.slice(0, 1000).map((p) => ({ lat: p.lat, lng: p.lng })), 15);
        }
      },
      () => {
        if (seq === fitSeq.current) setGlobalSearch(null);
      },
    );
  }, []);

  // ───────── movimento do mapa ─────────
  const onMove = useCallback(
    (view: MapView, bbox: BBox) => {
      const isFirst = firstMove.current;
      firstMove.current = false;
      setViewBox(bbox);
      setZoom(view.zoom);
      setPointsBox((prev) => (prev && !truncatedRef.current && bboxContains(prev, bbox) ? prev : padBBox(bbox, 0.35)));
      if (isFirst || autoUpdate || isDesktop !== true || syncListOnNextMove.current) {
        setListBox(bbox);
        syncListOnNextMove.current = false;
      }
      if (!isFirst || props.urlView) setUrlView(view);
      if (!isFirst) {
        clearTimeout(storeTimer.current);
        storeTimer.current = setTimeout(() => storeView(view), 600);
      }
      if (isFirst && props.initialFilters.q && !props.urlView) fitToQuery(props.initialFilters.q, props.initialFilters);
    },
    [autoUpdate, isDesktop, props.urlView, props.initialFilters, fitToQuery],
  );

  // ───────── URL compartilhável (sem recarregar nem criar histórico) ─────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const mode: ExploreMode = isDesktop === false && snap === "full" ? "lista" : "mapa";
      const qs = serializeExploreParams({ filters, view: urlView, mode });
      const next = qs ? `/?${qs}` : "/";
      if (window.location.pathname !== "/" || `${window.location.pathname}${window.location.search}` === next) return;
      try {
        window.history.replaceState(null, "", next);
      } catch {
        // alguns navegadores limitam replaceState em sequência
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [filters, urlView, snap, isDesktop]);

  // Esc fecha a seleção
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || searchOpen || filtersOpen || dateOpen) return;
      setSelectedId(null);
      setSpot(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, filtersOpen, dateOpen]);

  // ───────── filtros ─────────
  const updateFilters = (next: ExploreFilters) => {
    setFilters(next);
    setSelectedId(null);
    setSpot(null);
  };
  const toggleCategory = (slug: string) => updateFilters({ ...filters, cats: toggleInList(filters.cats, slug) });
  const setWhen = (when: string) => updateFilters({ ...filters, when });
  const clearAll = () => {
    fitSeq.current++;
    setGlobalSearch(null);
    updateFilters(clearFilters(filters));
  };

  const submitQuery = (raw: string) => {
    const q = normalizeQuery(raw);
    if (q) addRecentSearch(q);
    const next = { ...filters, q };
    updateFilters(next);
    // celular: mostra os resultados no mapa (o sheet recolhido traz a contagem)
    if (!desktop) setSnap((s) => (s === "full" ? s : "peek"));
    fitToQuery(q, next);
  };

  const nearMe = async () => {
    const p = await geo.locate();
    if (p) mapRef.current?.flyTo(p, Math.max(zoom, 13.5));
  };

  const searchActions: SearchActions = {
    onSubmitQuery: submitQuery,
    onPickCategory: (slug) => {
      fitSeq.current++;
      setGlobalSearch(null);
      updateFilters({ ...filters, q: "", cats: [slug] });
    },
    onPickPlace: (place) => {
      mapRef.current?.flyTo({ lat: place.lat, lng: place.lng }, PLACE_ZOOM[place.kind] ?? CITY_ZOOM);
      if (filters.q) {
        fitSeq.current++;
        setGlobalSearch(null);
        updateFilters({ ...filters, q: "" });
      }
    },
    onNearMe: () => void nearMe(),
  };

  // ───────── seleção ─────────
  const pointById = useMemo(() => new Map(points.points.map((p) => [p.id, p])), [points.points]);
  const selectedPoint = selectedId ? (pointById.get(selectedId) ?? null) : null;
  const selectedFromList = selectedId ? (list.items.find((i) => i.id === selectedId) ?? null) : null;
  const selectedFetch = useEventCards(selectedId && !selectedFromList ? [selectedId] : null, near);
  const selectedCard = selectedFromList ?? selectedFetch.cards?.[0] ?? null;
  const spotCards = useEventCards(spot, near);

  const select = (id: string) => {
    setSelectedId(id);
    setSpot(null);
    if (!desktop) setSnap("peek");
    const p = pointById.get(id);
    if (p) requestAnimationFrame(() => mapRef.current?.ensureVisible(p, desktop ? { top: 380, left: 170, right: 170 } : { bottom: sheetCover + 140 }));
  };

  const openSpot = (ids: string[], center: LatLng) => {
    setSelectedId(null);
    setSpot(ids);
    if (!desktop) {
      setSnap("peek");
      // depois que o sheet cresce, garante que o local continue visível acima dele
      setTimeout(() => mapRef.current?.ensureVisible(center), 520);
    }
  };

  const clearSelection = () => {
    setSelectedId(null);
    setSpot(null);
  };

  const onMapClick = () => {
    if (selectedId || spot) clearSelection();
    else if (!desktop && snap === "half") setSnap("peek");
  };

  // ───────── derivados de interface ─────────
  const q = filters.q;
  const firstLoad = list.initialLoading;
  const total = list.total;
  const label = countLabel(total, list.loading, firstLoad, q);
  const restricting = hasRestrictingFilters(filters);
  const canZoomOut = zoom > MIN_ZOOM + 0.5;
  const listStale = desktop && !autoUpdate && viewBox && listBox && bboxParam(viewBox, 3) !== bboxParam(listBox, 3);
  const noGlobalResults = Boolean(globalSearch && globalSearch.q === q && globalSearch.total === 0);
  const filterCount = activeFilterCount(filters);

  const peekHeight = Math.max(selectedId || spot ? 0 : MOBILE_PEEK_MIN, 28 + headerHeight + (selectedId || spot ? 10 : 34));

  const headerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  const insets: MapInsets = useMemo(
    () => (desktop ? { top: 16, right: 72, bottom: 16, left: 16 } : { top: MOBILE_TOP + 8, right: 0, bottom: sheetCover, left: 0 }),
    [desktop, sheetCover],
  );

  const popup: ExploreMapPopup | null =
    desktop && selectedId && (selectedPoint || selectedCard)
      ? {
          key: selectedId,
          lat: selectedPoint?.lat ?? selectedCard!.lat,
          lng: selectedPoint?.lng ?? selectedCard!.lng,
          content: <SelectedEventPopupCard event={selectedCard} point={selectedPoint} error={selectedFetch.error} onClose={clearSelection} />,
        }
      : null;

  const results = (opts: { scrollToSelected: boolean; compact?: boolean }) => (
    <EventResults
      items={list.items}
      initialLoading={firstLoad}
      refreshing={list.loading && !firstLoad}
      error={list.error}
      hasMore={list.hasMore}
      loadingMore={list.loadingMore}
      moreError={list.moreError}
      onLoadMore={list.loadMore}
      onRetry={list.retry}
      selectedId={selectedId}
      onHover={desktop ? setHoveredId : undefined}
      query={q}
      hasFilters={restricting}
      canZoomOut={canZoomOut && !noGlobalResults}
      onZoomOut={() => mapRef.current?.zoomBy(-2)}
      onClearFilters={clearAll}
      scrollToSelected={opts.scrollToSelected}
      compact={opts.compact}
    />
  );

  const spotSection = (compact: boolean) =>
    spot ? (
    <SpotList compact={compact} cards={spotCards.cards} count={spot.length} loading={spotCards.loading} error={spotCards.error} onRetry={spotCards.retry} onClose={clearSelection} />
  ) : null;

  const searchPillLabel = q ? `Busca: ${q}. Toque para alterar` : "Buscar eventos, lugares e organizadores";

  return (
    <div className="fixed inset-0 overflow-hidden bg-background lg:static lg:grid lg:h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(400px,440px)_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
      <h1 className="sr-only">{props.title}</h1>
      <p className="sr-only" aria-live="polite">
        {firstLoad ? "" : label}
      </p>

      {/* ───────── Painel lateral (desktop) ───────── */}
      {isDesktop !== false && (
        <aside className="hidden min-h-0 flex-col border-r border-border bg-background lg:flex" aria-label="Busca e lista de eventos">
          <div className="space-y-3 px-5 pt-5 pb-4">
            <SearchBox
              key={`desk-${q}`}
              initialQuery={q}
              committedQuery={q}
              onClear={() => submitQuery("")}
              near={near ?? (viewBox ? { lat: (viewBox[1] + viewBox[3]) / 2, lng: (viewBox[0] + viewBox[2]) / 2 } : null)}
              categories={categories}
              actions={searchActions}
            />
            <ScrollRow label="Quando" arrows>
              <DateChips filters={filters} onWhen={setWhen} onOpenDate={() => setDateOpen(true)} />
            </ScrollRow>
            <ScrollRow label="Categorias" arrows>
              <CategoryChips categories={categories} selected={filters.cats} onToggle={toggleCategory} />
            </ScrollRow>
          </div>
          <div className="border-y border-border px-5 pt-3 pb-2">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
                  <span className="truncate">{label}</span>
                  {list.loading && !firstLoad && <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-subtle-foreground" />}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">{filtersSummary(filters, categories)}</p>
              </div>
              <FiltersButton count={filterCount} onClick={() => setFiltersOpen(true)} />
            </div>
            <div className="mt-1.5 -mr-1 -ml-3 flex items-center justify-between gap-3">
              <SortMenu value={filters.sort} onChange={(sort) => updateFilters({ ...filters, sort })} />
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-muted-foreground">
                Atualizar ao mover o mapa
                <Switch
                  checked={autoUpdate}
                  onCheckedChange={(v) => {
                    setAutoUpdate(v);
                    if (v && viewBox) setListBox(viewBox);
                  }}
                  aria-label="Atualizar a lista ao mover o mapa"
                />
              </label>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
            {spot && <div className="mb-3">{spotSection(false)}</div>}
            {results({ scrollToSelected: true })}
          </div>
        </aside>
      )}

      {/* ───────── Mapa ───────── */}
      <section className="relative h-full min-h-0 overflow-hidden" aria-label="Mapa">
        {webgl ? (
          <ExploreMap
            ref={mapRef}
            className="absolute inset-0"
            initialView={initialView}
            points={points.points}
            selectedId={selectedId}
            highlightId={desktop ? hoveredId : null}
            userLocation={geo.position}
            insets={insets}
            popup={popup}
            onMove={onMove}
            onSelect={select}
            onSpot={openSpot}
            onMapClick={onMapClick}
            overlay={({ degraded }) => (
              <>
                {degraded && (
                  <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+136px)] z-20 flex justify-center px-4 lg:top-4 lg:justify-start">
                    <DegradedNotice />
                  </div>
                )}
                {/* desktop: controles do mapa */}
                {isDesktop !== false && (
                  <div className="absolute top-4 right-4 z-20 hidden flex-col gap-2 lg:flex">
                    <RoundButton label={geo.status === "active" ? "Centralizar em mim" : "Perto de mim"} onClick={() => void nearMe()} active={geo.status === "active"} busy={geo.status === "locating"}>
                      <LocateFixed />
                    </RoundButton>
                    <div className="glass flex flex-col overflow-hidden rounded-full border border-border shadow-float">
                      <button type="button" aria-label="Aproximar" onClick={() => mapRef.current?.zoomBy(1)} className="grid size-12 place-items-center text-foreground transition hover:bg-surface-2">
                        <Plus className="size-5" />
                      </button>
                      <span aria-hidden className="mx-3 h-px bg-border" />
                      <button type="button" aria-label="Afastar" onClick={() => mapRef.current?.zoomBy(-1)} className="grid size-12 place-items-center text-foreground transition hover:bg-surface-2">
                        <Minus className="size-5" />
                      </button>
                    </div>
                  </div>
                )}
                {listStale && (
                  <div className="absolute top-4 left-1/2 z-20 hidden -translate-x-1/2 lg:block">
                    <Button variant="glass" size="sm" onClick={() => viewBox && setListBox(viewBox)} className="shadow-float">
                      <RefreshCw /> Buscar nesta área
                    </Button>
                  </div>
                )}
                {desktop && !points.loading && !list.loading && total === 0 && !firstLoad && (
                  <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
                    <div className="glass rounded-full border border-border px-4 py-2 text-sm font-semibold shadow-float">
                      {noGlobalResults ? `Nenhum resultado para “${q}”` : "Nenhum evento nesta área"}
                    </div>
                  </div>
                )}
              </>
            )}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[var(--map-bg)] px-8 text-center">
            <div className="max-w-xs">
              <MapIcon className="mx-auto mb-3 size-8 text-subtle-foreground" />
              <p className="font-bold">Seu navegador não conseguiu abrir o mapa</p>
              <p className="mt-1 text-sm text-muted-foreground">A lista de eventos continua disponível. Atualizar o navegador costuma resolver.</p>
            </div>
          </div>
        )}

        {/* ───────── Celular: topo flutuante ───────── */}
        {isDesktop !== true && (
          <div
            className={cn(
              "safe-top absolute inset-x-0 top-0 z-30 transition-colors duration-300 lg:hidden",
              snap === "full" ? "border-b border-border bg-background/95 backdrop-blur-xl" : "bg-gradient-to-b from-background/55 to-transparent",
            )}
          >
            <div className="flex items-center gap-2 px-4 pt-3">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={searchPillLabel}
                aria-haspopup="dialog"
                className="glass flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border pr-2.5 pl-2.5 text-left shadow-float transition active:scale-[0.99]"
              >
                <LogoMark className="size-7 shrink-0" title="" />
                <span className={cn("min-w-0 flex-1 truncate text-[15px]", q ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {q ? `“${q}”` : "Buscar eventos e lugares"}
                </span>
                {!q && <Search aria-hidden className="mr-1 size-5 shrink-0 text-subtle-foreground" />}
              </button>
              {q && (
                <button
                  type="button"
                  onClick={() => submitQuery("")}
                  aria-label="Limpar busca"
                  className="glass grid size-12 shrink-0 place-items-center rounded-full border border-border text-foreground shadow-float"
                >
                  <X className="size-5" />
                </button>
              )}
              {viewer ? (
                <Link href="/perfil" aria-label={`Seu perfil (${viewer.name})`} className="glass grid size-12 shrink-0 place-items-center rounded-full border border-border shadow-float">
                  <Avatar name={viewer.name} src={viewer.avatarUrl} size="sm" />
                </Link>
              ) : (
                <Link
                  href="/entrar"
                  className="glass inline-flex h-12 shrink-0 items-center rounded-full border border-border px-3.5 text-sm font-bold shadow-float"
                >
                  Entrar
                </Link>
              )}
            </div>
            <ScrollRow label="Filtros rápidos" className="mt-2 pb-2">
              <div className="flex gap-2 px-4">
                <FiltersButton count={filterCount} onClick={() => setFiltersOpen(true)} className="h-11 shadow-card" />
                <DateChips filters={filters} onWhen={setWhen} onOpenDate={() => setDateOpen(true)} chipClassName="h-11 shadow-card" />
                <ChipDivider />
                <CategoryChips categories={categories} selected={filters.cats} onToggle={toggleCategory} chipClassName="h-11 shadow-card" />
              </div>
            </ScrollRow>
          </div>
        )}

        {/* ───────── Celular: bottom sheet ───────── */}
        {isDesktop !== true && (
          <BottomSheet
            className="z-20 lg:hidden"
            snap={snap}
            onSnapChange={setSnap}
            peekHeight={peekHeight}
            topGap={MOBILE_TOP}
            label="Eventos nesta área"
            handleLabel={(s) => (s === "peek" ? "Expandir a lista de eventos" : s === "half" ? "Abrir a lista em tela cheia" : "Recolher a lista")}
            onCoverChange={setSheetCover}
            above={
              snap === "peek" ? (
                <div className="pointer-events-none relative flex items-end justify-center px-4 pb-3">
                  <Button
                    variant="glass"
                    size="md"
                    className="pointer-events-auto h-11 rounded-full border-border px-5 shadow-float"
                    onClick={() => setSnap("full")}
                    aria-label="Ver em lista"
                  >
                    <List /> Lista
                  </Button>
                  <div className="pointer-events-auto absolute right-4 bottom-3">
                    <RoundButton
                      label={geo.status === "active" ? "Centralizar em mim" : "Perto de mim"}
                      onClick={() => void nearMe()}
                      active={geo.status === "active"}
                      busy={geo.status === "locating"}
                    >
                      <LocateFixed />
                    </RoundButton>
                  </div>
                </div>
              ) : null
            }
            header={
              <div ref={headerRef} className="px-4 pb-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[17px] font-extrabold tracking-tight">
                      <span className="truncate">{label}</span>
                      {list.loading && !firstLoad && <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-subtle-foreground" />}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground">{filtersSummary(filters, categories)}</p>
                  </div>
                  {snap !== "peek" && !selectedId && !spot && (
                    <SortMenu compact value={filters.sort} onChange={(sort) => updateFilters({ ...filters, sort })} />
                  )}
                </div>
                {selectedId && (
                  <SelectedEventSheetCard className="mt-3" event={selectedCard} point={selectedPoint} error={selectedFetch.error} onClose={clearSelection} />
                )}
                {spot && <div className="mt-3">{spotSection(true)}</div>}
              </div>
            }
          >
            <div className="px-2 pb-6">{results({ scrollToSelected: false, compact: true })}</div>
          </BottomSheet>
        )}

        {/* Celular: alternar para o mapa quando a lista está aberta */}
        {isDesktop !== true && snap === "full" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+16px)] z-40 flex justify-center lg:hidden">
            <Button
              variant="solid"
              size="md"
              onClick={() => setSnap("peek")}
              className="pointer-events-auto h-11 rounded-full bg-foreground px-5 text-background shadow-float hover:bg-foreground/90 animate-pop"
            >
              <MapIcon /> Mapa
            </Button>
          </div>
        )}
      </section>

      {searchOpen && (
        <SearchOverlay
          initialQuery={q}
          near={near ?? (viewBox ? { lat: (viewBox[1] + viewBox[3]) / 2, lng: (viewBox[0] + viewBox[2]) / 2 } : null)}
          categories={categories}
          actions={searchActions}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <FiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        onApply={(patch) => updateFilters({ ...filters, ...patch })}
        onClearAll={clearAll}
      />
      <DateDialog open={dateOpen} onOpenChange={setDateOpen} when={filters.when} onApply={setWhen} />
    </div>
  );
}

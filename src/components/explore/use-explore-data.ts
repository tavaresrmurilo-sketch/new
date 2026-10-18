"use client";

import { useCallback, useEffect, useState } from "react";
import type { PinPoint } from "@/components/map/markers";
import type { EventCardData } from "@/lib/events";
import type { ExploreFilters } from "@/lib/explore-params";
import type { BBox, LatLng } from "@/lib/geo";
import { cachedJson, errorMessage, getJson, isAbort, primeCache, type EventListResponse, type MapPointsResponse } from "./api";
import { listUrl, nearParam, pointsUrl } from "./urls";

export { listUrl, pointsUrl };

const POINTS_DEBOUNCE_MS = 250;
const LIST_DEBOUNCE_MS = 320;
const EMPTY_POINTS: PinPoint[] = [];

interface Settled<T> {
  url: string | null;
  data: T | null;
  error: string | null;
}

/** Pontos do mapa para um bbox (debounce, cancelamento e cache por URL). Mantém os anteriores enquanto carrega. */
export function useMapPoints(bbox: BBox | null, filters: ExploreFilters) {
  const url = bbox ? pointsUrl(bbox, filters) : null;
  const [state, setState] = useState<Settled<MapPointsResponse>>({ url: null, data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    const delay = cachedJson(url) ? 0 : POINTS_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      getJson<MapPointsResponse>(url, ctrl.signal).then(
        (data) => setState({ url, data, error: null }),
        (err) => {
          if (isAbort(err) || ctrl.signal.aborted) return;
          setState((prev) => ({ url, data: prev.data, error: errorMessage(err) }));
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [url, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return {
    points: state.data?.points ?? EMPTY_POINTS,
    total: state.data?.total ?? 0,
    truncated: state.data?.truncated ?? false,
    loading: url !== null && state.url !== url,
    error: state.url === url ? state.error : null,
    settledUrl: state.url,
    retry,
  };
}

interface ListState {
  url: string | null;
  items: EventCardData[];
  total: number;
  nextCursor: string | null;
  error: string | null;
  moreError: string | null;
  loadingMore: boolean;
}

export interface InitialList {
  url: string;
  data: EventListResponse;
}

/** Lista paginada da área (primeira página com debounce; "carregar mais" por cursor). */
export function useEventList(bbox: BBox | null, near: LatLng | null, filters: ExploreFilters, opts: { enabled: boolean; initial?: InitialList | null }) {
  const url = opts.enabled ? listUrl(bbox, near, filters) : null;
  const [state, setState] = useState<ListState>(() => {
    if (opts.initial && typeof window !== "undefined") primeCache(opts.initial.url, opts.initial.data);
    return {
      url: opts.initial?.url ?? null,
      items: opts.initial?.data.items ?? [],
      total: opts.initial?.data.total ?? 0,
      nextCursor: opts.initial?.data.nextCursor ?? null,
      error: null,
      moreError: null,
      loadingMore: false,
    };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    const delay = cachedJson(url) ? 0 : LIST_DEBOUNCE_MS;
    const timer = setTimeout(() => {
      getJson<EventListResponse>(url, ctrl.signal).then(
        (data) => setState({ url, items: data.items, total: data.total, nextCursor: data.nextCursor, error: null, moreError: null, loadingMore: false }),
        (err) => {
          if (isAbort(err) || ctrl.signal.aborted) return;
          setState((prev) => ({ ...prev, url, error: errorMessage(err), loadingMore: false }));
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [url, attempt]);

  const settled = url !== null && state.url === url;

  const loadMore = useCallback(() => {
    if (!settled || !state.nextCursor || state.loadingMore || !url) return;
    const pageUrl = `${url}${url.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(state.nextCursor)}`;
    setState((prev) => ({ ...prev, loadingMore: true, moreError: null }));
    getJson<EventListResponse>(pageUrl).then(
      (data) =>
        setState((prev) => {
          if (prev.url !== url) return prev;
          const seen = new Set(prev.items.map((i) => i.id));
          return { ...prev, items: [...prev.items, ...data.items.filter((i) => !seen.has(i.id))], nextCursor: data.nextCursor, total: data.total, loadingMore: false };
        }),
      (err) => setState((prev) => (prev.url === url ? { ...prev, loadingMore: false, moreError: errorMessage(err) } : prev)),
    );
  }, [settled, state.nextCursor, state.loadingMore, url]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    items: state.items,
    total: state.total,
    hasMore: settled && Boolean(state.nextCursor),
    loading: url !== null && !settled,
    /** Ainda não há nenhum resultado para mostrar (primeira carga). */
    initialLoading: url !== null && !settled && state.url === null,
    error: settled ? state.error : null,
    moreError: state.moreError,
    loadingMore: state.loadingMore,
    loadMore,
    retry,
  };
}

/** Cards de eventos específicos (seleção, eventos no mesmo local). */
export function useEventCards(ids: string[] | null, near: LatLng | null) {
  const key = ids && ids.length ? ids.slice(0, 50).join(",") : null;
  const n = nearParam(near);
  const url = key ? `/api/events?ids=${key}${n ? `&near=${n}` : ""}` : null;
  const [state, setState] = useState<Settled<EventCardData[]>>({ url: null, data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    getJson<EventListResponse>(url, ctrl.signal).then(
      (data) => setState({ url, data: data.items, error: null }),
      (err) => {
        if (isAbort(err) || ctrl.signal.aborted) return;
        setState({ url, data: null, error: errorMessage(err) });
      },
    );
    return () => ctrl.abort();
  }, [url, attempt]);

  const settled = url !== null && state.url === url;
  return {
    cards: settled ? (state.data ?? []) : null,
    loading: url !== null && !settled,
    error: settled ? state.error : null,
    retry: () => setAttempt((x) => x + 1),
  };
}

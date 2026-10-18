"use client";

import { ArrowRight, Megaphone, RefreshCw, SearchX, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { EventCard, EventCardSkeleton } from "@/components/events/event-card";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/misc";
import type { EventCardData } from "@/lib/events";
import { cn } from "@/lib/utils";

interface EventResultsProps {
  items: EventCardData[];
  /** Primeira carga, sem nada para mostrar ainda. */
  initialLoading: boolean;
  /** Recarregando (mantém os itens anteriores visíveis, levemente esmaecidos). */
  refreshing: boolean;
  error: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  moreError: string | null;
  onLoadMore: () => void;
  onRetry: () => void;
  selectedId?: string | null;
  onHover?: (id: string | null) => void;
  /** Estado vazio */
  query?: string;
  hasFilters: boolean;
  canZoomOut: boolean;
  onZoomOut: () => void;
  onClearFilters: () => void;
  /** Rola automaticamente até o card selecionado (desktop). */
  scrollToSelected?: boolean;
  className?: string;
}

export function OrganizerCta({ className }: { className?: string }) {
  return (
    <Link
      href="/para-organizadores"
      className={cn(
        "group flex items-center gap-3 rounded-3xl border border-border bg-surface p-4 transition hover:border-border-strong hover:bg-surface-2",
        className,
      )}
    >
      <span className="bg-brand-gradient grid size-11 shrink-0 place-items-center rounded-2xl text-white shadow-[0_8px_20px_-8px_rgb(255_77_141_/_0.8)]">
        <Megaphone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold tracking-tight">Organiza eventos?</span>
        <span className="block text-[13px] text-muted-foreground">Publique no Mixtour e apareça para quem está por perto.</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}

/** Lista de resultados da área: skeletons, erro, vazio honesto, paginação infinita. */
export function EventResults({
  items,
  initialLoading,
  refreshing,
  error,
  hasMore,
  loadingMore,
  moreError,
  onLoadMore,
  onRetry,
  selectedId,
  onHover,
  query,
  hasFilters,
  canZoomOut,
  onZoomOut,
  onClearFilters,
  scrollToSelected,
  className,
}: EventResultsProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onLoadMore();
    }, { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onLoadMore, items.length]);

  useEffect(() => {
    if (!scrollToSelected || !selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [scrollToSelected, selectedId, items]);

  if (initialLoading) {
    return (
      <div className={cn("space-y-1", className)} aria-busy="true" aria-label="Carregando eventos">
        {Array.from({ length: 6 }, (_, i) => (
          <EventCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (error && !items.length) {
    return (
      <div className={cn("px-2 py-6", className)}>
        <Alert
          tone="danger"
          title="Não foi possível carregar os eventos"
          action={
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw /> Tentar de novo
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className={cn("pb-6", className)}>
        <EmptyState
          icon={<SearchX />}
          title={query ? `Nada encontrado para “${query}”` : "Nada por aqui ainda"}
          description={
            query
              ? "Confira a grafia, tente outras palavras ou afaste o mapa para buscar em uma área maior."
              : hasFilters
                ? "Nenhum evento desta área combina com os filtros escolhidos. Afaste o mapa ou limpe os filtros."
                : "Ainda não há eventos publicados nesta área. Afaste o mapa para ver o que está rolando por perto."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {canZoomOut && (
                <Button variant="secondary" size="sm" onClick={onZoomOut}>
                  <ZoomOut /> Afastar o mapa
                </Button>
              )}
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  {query ? "Limpar busca e filtros" : "Limpar filtros"}
                </Button>
              )}
            </div>
          }
          className="py-8"
        />
        <OrganizerCta className="mx-2" />
      </div>
    );
  }

  return (
    <div className={cn("transition-opacity", refreshing && "opacity-60", className)} aria-busy={refreshing || undefined}>
      <ul ref={listRef} className="space-y-0.5">
        {items.map((event) => (
          <li key={event.id} data-event-id={event.id}>
            <EventCard
              event={event}
              selected={selectedId === event.id}
              onMouseEnter={onHover ? () => onHover(event.id) : undefined}
              onMouseLeave={onHover ? () => onHover(null) : undefined}
            />
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden />
      {(hasMore || loadingMore || moreError) && (
        <div className="flex flex-col items-center gap-2 py-5">
          {moreError && <p className="text-sm text-danger">{moreError}</p>}
          <Button variant="secondary" size="sm" onClick={onLoadMore} loading={loadingMore} disabled={!hasMore}>
            {moreError ? "Tentar de novo" : "Carregar mais eventos"}
          </Button>
        </div>
      )}
      {!hasMore && !loadingMore && (
        <div className="px-2 pt-4 pb-6">
          <p className="mb-4 text-center text-[13px] text-subtle-foreground">Você chegou ao fim da lista desta área.</p>
          <OrganizerCta />
        </div>
      )}
      {refreshing && (
        <span className="sr-only" role="status">
          Atualizando a lista
        </span>
      )}
    </div>
  );
}

"use client";

import { CalendarDays, ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CategoryIcon } from "@/components/events/category-icon";
import { Chip } from "@/components/ui/chip";
import type { CategoryDTO } from "@/lib/categories";
import { DEFAULT_WHEN, isCustomWhen, whenChipLabel, type ExploreFilters } from "@/lib/explore-params";
import { cn } from "@/lib/utils";

export const DATE_CHIPS = [
  { value: "now", label: "Agora" },
  { value: "today", label: "Hoje" },
  { value: "tomorrow", label: "Amanhã" },
  { value: "weekend", label: "Fim de semana" },
  { value: "week", label: "Esta semana" },
] as const;

/** Fileira rolável horizontalmente, com setas no desktop e bordas esmaecidas. */
export function ScrollRow({ children, className, label, arrows = false }: { children: ReactNode; className?: string; label: string; arrows?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const start = el.scrollLeft <= 2;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const scrollBy = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: "smooth" });
  };

  const mask = !edges.start && !edges.end
    ? "linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent)"
    : !edges.start
      ? "linear-gradient(to right, transparent, #000 28px)"
      : !edges.end
        ? "linear-gradient(to left, transparent, #000 28px)"
        : undefined;

  return (
    <div className={cn("group/row relative", className)}>
      <div
        ref={ref}
        role="group"
        aria-label={label}
        onScroll={measure}
        className="no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain scroll-smooth"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
      {arrows && !edges.start && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => scrollBy(-1)}
          className="absolute top-1/2 left-0 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-elevated text-foreground opacity-0 shadow-card transition group-hover/row:opacity-100"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {arrows && !edges.end && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => scrollBy(1)}
          className="absolute top-1/2 right-0 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-elevated text-foreground opacity-0 shadow-card transition group-hover/row:opacity-100"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}

export function FiltersButton({ count, onClick, className, size = "md" }: { count: number; onClick: () => void; className?: string; size?: "sm" | "md" }) {
  return (
    <Chip
      size={size}
      onClick={onClick}
      active={false}
      aria-pressed={undefined}
      aria-haspopup="dialog"
      aria-label={count ? `Filtros (${count} ativos)` : "Filtros"}
      icon={<SlidersHorizontal />}
      className={className}
    >
      Filtros
      {count > 0 && (
        <span className="bg-brand-gradient -mr-1.5 grid min-w-5 place-items-center rounded-full px-1 text-[11px] leading-5 font-bold text-white">{count}</span>
      )}
    </Chip>
  );
}

interface ChipsProps {
  filters: ExploreFilters;
  onWhen: (when: string) => void;
  onOpenDate: () => void;
  size?: "sm" | "md";
  chipClassName?: string;
}

export function DateChips({ filters, onWhen, onOpenDate, size = "md", chipClassName }: ChipsProps) {
  const custom = isCustomWhen(filters.when);
  return (
    <>
      {DATE_CHIPS.map((d) => {
        const active = filters.when === d.value;
        return (
          <Chip key={d.value} size={size} active={active} onClick={() => onWhen(active ? DEFAULT_WHEN : d.value)} className={chipClassName}>
            {d.value === "now" && <span aria-hidden className={cn("size-2 rounded-full", active ? "bg-white" : "bg-success")} />}
            {d.label}
          </Chip>
        );
      })}
      <Chip size={size} active={custom} onClick={onOpenDate} icon={<CalendarDays />} aria-haspopup="dialog" aria-pressed={custom} className={chipClassName}>
        {custom ? whenChipLabel(filters.when) : "Escolher data"}
      </Chip>
      {custom && (
        <button
          type="button"
          aria-label="Remover data escolhida"
          onClick={() => onWhen(DEFAULT_WHEN)}
          className={cn(
            "glass -ml-1 grid shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:text-foreground",
            size === "md" ? "size-10" : "size-8",
            chipClassName && "size-11",
          )}
        >
          <X className="size-4" />
        </button>
      )}
    </>
  );
}

export function CategoryChips({
  categories,
  selected,
  onToggle,
  size = "md",
  chipClassName,
}: {
  categories: CategoryDTO[];
  selected: string[];
  onToggle: (slug: string) => void;
  size?: "sm" | "md";
  chipClassName?: string;
}) {
  return (
    <>
      {categories.map((c) => (
        <Chip
          key={c.slug}
          size={size}
          active={selected.includes(c.slug)}
          color={c.color}
          icon={<CategoryIcon icon={c.icon} />}
          onClick={() => onToggle(c.slug)}
          className={chipClassName}
        >
          {c.name}
        </Chip>
      ))}
    </>
  );
}

export function ChipDivider() {
  return <span aria-hidden className="my-2 w-px shrink-0 self-stretch bg-border-strong/70" />;
}

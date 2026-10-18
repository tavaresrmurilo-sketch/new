"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SheetSnap = "peek" | "half" | "full";

const ORDER: SheetSnap[] = ["peek", "half", "full"];
const TRANSITION = "transform 440ms cubic-bezier(0.22, 1, 0.36, 1)";
/** Espaço mínimo entre "recolhido" e "meio" quando a tela é baixa. */
const HALF_MIN_EXTRA = 96;

interface BottomSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Altura visível quando recolhido (px). */
  peekHeight: number;
  /** Distância do topo da área até o sheet cheio (px, somada à safe area). */
  topGap: number;
  /** Rótulo da região (leitores de tela). */
  label: string;
  /** Texto do botão da alça para cada estado. */
  handleLabel: (snap: SheetSnap) => string;
  header: ReactNode;
  children: ReactNode;
  /** Controles flutuantes logo acima do sheet (acompanham o arraste). */
  above?: ReactNode;
  /** Altura coberta pelo sheet (do topo do sheet até a base do container), para o mapa compensar. */
  onCoverChange?: (px: number) => void;
  className?: string;
}

interface DragState {
  pointerId: number;
  startY: number;
  startT: number;
  samples: { y: number; t: number }[];
  active: boolean;
}

function currentTranslate(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  try {
    return new DOMMatrixReadOnly(t).m42;
  } catch {
    return 0;
  }
}

function velocity(samples: { y: number; t: number }[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (const s of samples) if (last.t - s.t <= 100) {
    first = s;
    break;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0; // px/ms (positivo = para baixo)
}

/**
 * Bottom sheet arrastável (pointer events) com 3 posições — recolhido, meio e cheio —,
 * inércia e encaixe suave. O conteúdo só rola quando cheio; dali, puxar para baixo
 * no topo da lista recolhe o sheet. A alça é um botão (teclado: Enter/Espaço, ↑/↓).
 */
export function BottomSheet({
  snap,
  onSnapChange,
  peekHeight,
  topGap,
  label,
  handleLabel,
  header,
  children,
  above,
  onCoverChange,
  className,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const [dragY, setDragY] = useState<number | null>(null);

  const snapPx = (s: SheetSnap): number => {
    const el = sheetRef.current;
    if (!el) return 0;
    const hs = el.getBoundingClientRect().height;
    const region = el.parentElement?.getBoundingClientRect().height ?? hs;
    const top = region - hs;
    if (s === "full") return 0;
    if (s === "peek") return Math.max(0, hs - peekHeight);
    return Math.max(0, Math.min(hs / 2 - top / 2, hs - peekHeight - HALF_MIN_EXTRA));
  };

  const settle = (projected: number, v: number) => {
    const candidates = ORDER.map((s) => ({ s, px: snapPx(s) }));
    let target = candidates.reduce((best, c) => (Math.abs(c.px - projected) < Math.abs(best.px - projected) ? c : best)).s;
    // um "peteleco" rápido sempre avança um passo na direção do gesto
    if (Math.abs(v) > 0.6 && target === snap) {
      const i = ORDER.indexOf(snap);
      target = ORDER[Math.max(0, Math.min(ORDER.length - 1, v < 0 ? i + 1 : i - 1))];
    }
    setDragY(null);
    if (target !== snap) onSnapChange(target);
  };

  const rubber = (t: number) => {
    const max = snapPx("peek");
    if (t < 0) return -Math.min(40, -t * 0.25);
    if (t > max) return max + Math.min(60, (t - max) * 0.3);
    return t;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const inContent = contentRef.current?.contains(e.target as Node);
    if (inContent && snap === "full") return; // rolagem nativa
    const el = sheetRef.current;
    if (!el) return;
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startT: currentTranslate(el), samples: [{ y: e.clientY, t: e.timeStamp }], active: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dy) < 6) return;
      d.active = true;
      try {
        sheetRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ponteiro já liberado
      }
    }
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 8) d.samples.shift();
    setDragY(rubber(d.startT + dy));
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!d.active) return;
    suppressClick.current = true;
    const v = velocity(d.samples);
    const current = rubber(d.startT + (e.clientY - d.startY));
    settle(current + v * 220, v);
  };

  // Cheio: puxar para baixo com a lista no topo recolhe o sheet (touch, para não brigar com a rolagem).
  useEffect(() => {
    const el = contentRef.current;
    if (!el || snap !== "full") return;
    let startY = 0;
    let pulling = false;
    let samples: { y: number; t: number }[] = [];
    let last = 0;
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
      pulling = false;
      samples = [];
    };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (!pulling) {
        if (el.scrollTop <= 0 && y - startY > 8) {
          pulling = true;
          startY = y;
        } else return;
      }
      e.preventDefault();
      last = Math.max(0, y - startY);
      samples.push({ y, t: e.timeStamp });
      if (samples.length > 8) samples.shift();
      setDragY(last * 0.9);
    };
    const onEnd = () => {
      if (!pulling) return;
      pulling = false;
      suppressClick.current = true;
      settle(last * 0.9 + velocity(samples) * 220, velocity(samples));
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // settle/snapPx leem refs e props atuais; recriar a cada snap basta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  // Informa ao mapa quanto da tela o sheet cobre (após o encaixe e em redimensionamentos).
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !onCoverChange) return;
    const report = () => {
      const container = el.parentElement?.parentElement;
      if (!container) return;
      onCoverChange(Math.max(0, container.getBoundingClientRect().bottom - el.getBoundingClientRect().top));
    };
    const timer = setTimeout(report, 460);
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [snap, peekHeight, onCoverChange]);

  const onHandleKey = (e: React.KeyboardEvent) => {
    const i = ORDER.indexOf(snap);
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onSnapChange(ORDER[Math.min(ORDER.length - 1, i + 1)]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onSnapChange(ORDER[Math.max(0, i - 1)]);
    }
  };

  const cycle = () => onSnapChange(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");

  const snapTransform =
    snap === "full"
      ? "translateY(0px)"
      : snap === "peek"
        ? `translateY(calc(100% - ${peekHeight}px))`
        : `translateY(max(0px, min(calc(50% - (env(safe-area-inset-top) + ${topGap}px) / 2), calc(100% - ${peekHeight + HALF_MIN_EXTRA}px))))`;

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom))] overflow-hidden", className)}>
      <section
        ref={sheetRef}
        aria-label={label}
        className="pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-[28px] border border-b-0 border-border bg-elevated shadow-[0_-12px_40px_-12px_rgb(0_0_0_/_0.45)] will-change-transform"
        style={{
          top: `calc(env(safe-area-inset-top) + ${topGap}px)`,
          transform: dragY != null ? `translateY(${dragY}px)` : snapTransform,
          transition: dragY != null ? "none" : TRANSITION,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        {above && <div className="absolute inset-x-0 bottom-full">{above}</div>}
        <div className="shrink-0 touch-none select-none">
          <button
            type="button"
            onClick={cycle}
            onKeyDown={onHandleKey}
            aria-expanded={snap !== "peek"}
            aria-label={handleLabel(snap)}
            className="group mx-auto flex h-6 w-24 items-center justify-center rounded-full focus-visible:outline-offset-0"
          >
            <span aria-hidden className="h-1.5 w-10 rounded-full bg-border-strong transition-colors group-hover:bg-subtle-foreground" />
          </button>
          {header}
        </div>
        <div
          ref={contentRef}
          inert={snap === "peek"}
          className={cn(
            "min-h-0 flex-1 overscroll-contain",
            snap === "full" ? "touch-pan-y overflow-y-auto" : "touch-none overflow-hidden",
          )}
        >
          {children}
        </div>
      </section>
    </div>
  );
}

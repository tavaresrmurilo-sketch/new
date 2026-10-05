"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarClock, Star } from "lucide-react";
import { toast } from "sonner";
import { RadarBadge } from "@/components/common/radar-badge";
import { UserAvatar } from "@/components/common/user-avatar";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moveStageAction } from "../actions";
import { CloseReasonDialog } from "./close-reason-dialog";

export interface BoardStage {
  id: string;
  name: string;
  kind: "OPEN" | "WON" | "LOST";
  probability: number;
}

export interface BoardCard {
  id: string;
  title: string;
  value: number;
  stageId: string;
  status: string;
  probability: number;
  clientName: string;
  keyAccount: boolean;
  ownerName: string | null;
  expectedCloseDate: string | null;
  score: number | null;
  category: "HOT" | "WARM" | "COLD" | "AT_RISK" | null;
  tags: string[];
}

function Card({ card, currency, showMoney, overlay, todayKey }: { card: BoardCard; currency: string; showMoney: boolean; overlay?: boolean; todayKey: string }) {
  const overdue = card.status === "OPEN" && card.expectedCloseDate && card.expectedCloseDate < todayKey;
  return (
    <div className={cn("space-y-2 rounded-md border bg-card p-2.5 text-left shadow-sm", overlay && "rotate-1 shadow-lg ring-2 ring-primary/30")}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/opportunities/${card.id}`} className="line-clamp-2 text-[13px] font-medium leading-snug hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {card.title}
        </Link>
        {card.ownerName ? <UserAvatar name={card.ownerName} size="xs" /> : null}
      </div>
      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
        {card.keyAccount ? <Star className="size-3 shrink-0 fill-amber-400 text-amber-500" /> : null}
        {card.clientName}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {showMoney ? <span className="tabular text-xs font-semibold">{formatCurrency(card.value, currency, { compact: true })}</span> : null}
        {card.category ? <RadarBadge category={card.category} score={card.score} /> : null}
        {card.expectedCloseDate ? (
          <span className={cn("ml-auto inline-flex items-center gap-0.5 text-[11px] text-muted-foreground", overdue && "font-medium text-destructive")}>
            <CalendarClock className="size-3" /> {formatShortDate(card.expectedCloseDate)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DraggableCard(props: { card: BoardCard; currency: string; showMoney: boolean; disabled: boolean; todayKey: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.card.id, disabled: props.disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md", isDragging && "opacity-30", !props.disabled && "cursor-grab active:cursor-grabbing")} aria-roledescription="Cartão arrastável" aria-label={`${props.card.title} — ${props.card.clientName}`}>
      <Card {...props} />
    </div>
  );
}

function Column({ stage, cards, children, currency, showMoney }: { stage: BoardStage; cards: BoardCard[]; children: React.ReactNode; currency: string; showMoney: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = cards.reduce((s, c) => s + c.value, 0);
  const weighted = cards.reduce((s, c) => s + (c.value * c.probability) / 100, 0);
  return (
    <section ref={setNodeRef} aria-label={`Etapa ${stage.name}`} className={cn("flex w-[272px] shrink-0 flex-col rounded-lg border bg-subtle/70 transition-colors", isOver && "border-primary/50 bg-primary/5")}>
      <header className="space-y-0.5 border-b px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn("truncate text-[13px] font-semibold", stage.kind === "WON" && "text-success", stage.kind === "LOST" && "text-destructive")}>{stage.name}</h3>
          <span className="tabular rounded-full bg-background px-1.5 text-[11px] text-muted-foreground">{cards.length}</span>
        </div>
        {showMoney ? (
          <p className="tabular text-[11px] text-muted-foreground">
            {formatCurrency(total, currency, { compact: true })}
            {stage.kind === "OPEN" ? ` · pond. ${formatCurrency(weighted, currency, { compact: true })}` : ""} · {stage.probability}%
          </p>
        ) : null}
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">{children}</div>
    </section>
  );
}

/** Kanban do pipeline com drag-and-drop real (mouse, toque e teclado). */
export function PipelineBoard({ stages, initialCards, currency, showMoney, canWrite, todayKey }: { stages: BoardStage[]; initialCards: BoardCard[]; currency: string; showMoney: boolean; canWrite: boolean; todayKey: string }) {
  const router = useRouter();
  const [cards, setCards] = React.useState(initialCards);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [closing, setClosing] = React.useState<{ cardId: string; stage: BoardStage; previous: string } | null>(null);
  React.useEffect(() => setCards(initialCards), [initialCards]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const active = cards.find((c) => c.id === activeId) ?? null;

  const commit = async (cardId: string, stage: BoardStage, previous: string, closeReason?: string, closeNotes?: string) => {
    const r = await moveStageAction({ id: cardId, stageId: stage.id, closeReason: closeReason as never, closeNotes });
    if (!r.ok) {
      toast.error(r.error);
      setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, stageId: previous } : c)));
      return;
    }
    toast.success(stage.kind === "WON" ? "Negócio ganho! 🎉" : stage.kind === "LOST" ? "Oportunidade marcada como perdida" : `Movida para ${stage.name}`);
    router.refresh();
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const cardId = String(e.active.id);
    const stageId = e.over ? String(e.over.id) : null;
    const card = cards.find((c) => c.id === cardId);
    const stage = stages.find((s) => s.id === stageId);
    if (!card || !stage || card.stageId === stage.id) return;
    const previous = card.stageId;
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, stageId: stage.id, probability: stage.probability, status: stage.kind === "OPEN" ? "OPEN" : stage.kind } : c)));
    if (stage.kind !== "OPEN") setClosing({ cardId, stage, previous });
    else void commit(cardId, stage, previous);
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" style={{ minHeight: "calc(100dvh - 230px)" }}>
          {stages.map((stage) => {
            const list = cards.filter((c) => c.stageId === stage.id);
            return (
              <Column key={stage.id} stage={stage} cards={list} currency={currency} showMoney={showMoney}>
                {list.map((card) => (
                  <DraggableCard key={card.id} card={card} currency={currency} showMoney={showMoney} disabled={!canWrite} todayKey={todayKey} />
                ))}
                {!list.length ? <p className="py-6 text-center text-xs text-muted-foreground/70">Arraste oportunidades para cá</p> : null}
              </Column>
            );
          })}
        </div>
        <DragOverlay>{active ? <Card card={active} currency={currency} showMoney={showMoney} overlay todayKey={todayKey} /> : null}</DragOverlay>
      </DndContext>
      <CloseReasonDialog
        open={Boolean(closing)}
        kind={closing?.stage.kind === "LOST" ? "LOST" : "WON"}
        title={cards.find((c) => c.id === closing?.cardId)?.title ?? ""}
        onCancel={() => {
          if (closing) setCards((cs) => cs.map((c) => (c.id === closing.cardId ? { ...c, stageId: closing.previous } : c)));
          setClosing(null);
        }}
        onConfirm={async (reason, notes) => {
          if (!closing) return;
          await commit(closing.cardId, closing.stage, closing.previous, reason, notes);
          setClosing(null);
        }}
      />
    </>
  );
}

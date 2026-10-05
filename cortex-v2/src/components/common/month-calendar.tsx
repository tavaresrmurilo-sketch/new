import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysToKey, diffKeys } from "@/lib/dates";
import { buildHref, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export interface CalendarEvent {
  id: string;
  dateKey: string;
  title: string;
  href: string;
  tone: "task" | "task-overdue" | "task-done" | "meeting" | "contract" | "proposal";
  time?: string;
}

const TONE: Record<CalendarEvent["tone"], string> = {
  task: "bg-primary/10 text-primary",
  "task-overdue": "bg-destructive/10 text-destructive",
  "task-done": "bg-muted text-muted-foreground line-through",
  meeting: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  contract: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  proposal: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const firstKey = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const weekday = (new Date(`${firstKey}T12:00:00Z`).getUTCDay() + 6) % 7;
  const gridStart = addDaysToKey(firstKey, -weekday);
  const days = diffKeys(gridStart, next);
  const gridEnd = addDaysToKey(gridStart, Math.ceil(days / 7) * 7);
  return { firstKey, next, gridStart, gridEnd, y, m };
}

/** Calendário mensal renderizado no servidor (navegação por URL ?month=AAAA-MM). */
export function MonthCalendar({ month, todayKey, events, pathname, searchParams }: { month: string; todayKey: string; events: CalendarEvent[]; pathname: string; searchParams: SearchParams }) {
  const { firstKey, next, gridStart, gridEnd, y, m } = monthBounds(month);
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const nextMonth = next.slice(0, 7);
  const days: string[] = [];
  for (let k = gridStart; k < gridEnd; k = addDaysToKey(k, 1)) days.push(k);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(e.dateKey, [...(byDay.get(e.dateKey) ?? []), e]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold capitalize">
          {MONTHS[m - 1]} {y}
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <Link href={buildHref(pathname, searchParams, { month: prevMonth })} className="rounded-md border p-1.5 hover:bg-accent" aria-label="Mês anterior">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={buildHref(pathname, searchParams, { month: null })} className="rounded-md border px-2.5 py-1 text-[13px] hover:bg-accent">
            Hoje
          </Link>
          <Link href={buildHref(pathname, searchParams, { month: nextMonth })} className="rounded-md border p-1.5 hover:bg-accent" aria-label="Próximo mês">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 overflow-hidden rounded-lg border bg-border" style={{ gap: 1 }} role="grid">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-subtle px-2 py-1.5 text-xs font-medium text-muted-foreground" role="columnheader">
              {d}
            </div>
          ))}
          {days.map((k) => {
            const inMonth = k >= firstKey && k < next;
            const list = byDay.get(k) ?? [];
            return (
              <div key={k} role="gridcell" className={cn("min-h-[108px] bg-background p-1.5", !inMonth && "bg-subtle/60")}>
                <p className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs", k === todayKey ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "text-foreground" : "text-muted-foreground/60")}>
                  {Number(k.slice(8))}
                </p>
                <ul className="space-y-0.5">
                  {list.slice(0, 4).map((e) => (
                    <li key={`${e.tone}-${e.id}`}>
                      <Link href={e.href} className={cn("block truncate rounded px-1 py-0.5 text-[11px] font-medium hover:opacity-80", TONE[e.tone])} title={e.title}>
                        {e.time ? `${e.time} ` : ""}
                        {e.title}
                      </Link>
                    </li>
                  ))}
                  {list.length > 4 ? <li className="px-1 text-[11px] text-muted-foreground">+{list.length - 4} mais</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> Tarefa</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-destructive" /> Tarefa atrasada</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> Reunião</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> Vencimento de contrato</span>
        <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-violet-500" /> Validade de proposta</span>
      </div>
    </div>
  );
}

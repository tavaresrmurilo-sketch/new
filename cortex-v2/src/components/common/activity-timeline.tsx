import * as React from "react";
import Link from "next/link";
import {
  CalendarCheck, CheckCircle2, CircleDot, FileSignature, FileText, FolderKanban, Mail, MessageCircle, MessageSquare,
  MoveRight, Phone, PlusCircle, StickyNote, TriangleAlert, Trophy, UserPlus, XCircle, MapPin,
} from "lucide-react";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  action: string;
  channel?: string | null;
  title: string;
  body?: string | null;
  actorName?: string | null;
  occurredAt: Date | string;
  /** link para o registro de origem (opcional) */
  href?: string | null;
}

function iconFor(item: TimelineItem) {
  if (item.channel) {
    return { CALL: Phone, EMAIL: Mail, WHATSAPP: MessageCircle, MEETING: CalendarCheck, VISIT: MapPin, NOTE: StickyNote, ISSUE: TriangleAlert }[item.channel] ?? MessageSquare;
  }
  const a = item.action;
  if (a.endsWith(".created")) return a.startsWith("lead") ? UserPlus : a.startsWith("project") ? FolderKanban : PlusCircle;
  if (a.includes("stage_changed")) return MoveRight;
  if (a.includes("won")) return Trophy;
  if (a.includes("lost") || a.includes("rejected")) return XCircle;
  if (a.startsWith("proposal")) return FileText;
  if (a.startsWith("contract")) return FileSignature;
  if (a.includes("completed")) return CheckCircle2;
  if (a.startsWith("meeting")) return CalendarCheck;
  return CircleDot;
}

export function ActivityTimeline({ items, tz, emptyText = "Nenhuma atividade registrada ainda.", className }: { items: TimelineItem[]; tz: string; emptyText?: string; className?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className={cn("relative space-y-0", className)}>
      {items.map((item, i) => {
        const Icon = iconFor(item);
        const date = typeof item.occurredAt === "string" ? new Date(item.occurredAt) : item.occurredAt;
        return (
          <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < items.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full border bg-background",
                item.channel === "ISSUE" && "border-warning/40 text-warning",
              )}
            >
              <Icon className="size-3.5 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] leading-snug">
                {item.href ? (
                  <Link href={item.href} className="font-medium hover:underline">
                    {item.title}
                  </Link>
                ) : (
                  <span className="font-medium">{item.title}</span>
                )}
              </p>
              {item.body ? <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{item.body}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground" title={formatDateTime(date, tz)}>
                {item.actorName ? `${item.actorName} · ` : ""}
                {formatDateTime(date, tz, { year: undefined })} · {formatRelativeTime(date)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

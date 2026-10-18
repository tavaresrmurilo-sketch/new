import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { genericMessage } from "@/server/email/templates";
import { notify } from "@/server/notifications";
import { localDayKey } from "@/lib/dates";
import { formatShortDate, formatTime } from "@/lib/format";

/** Lembretes vão para eventos que começam entre agora e as próximas 36 h. */
export const REMINDER_WINDOW_HOURS = 36;
const BATCH = 500;
const MAX_BATCHES = 40;

/** "Hoje", "Amanhã" ou a data curta ("Sáb, 18 out") no fuso do evento. */
export function reminderDayLabel(startsAt: Date, now: Date, tz: string): string {
  const key = localDayKey(startsAt, tz);
  if (key === localDayKey(now, tz)) return "Hoje";
  if (key === localDayKey(new Date(now.getTime() + 86_400_000), tz)) return "Amanhã";
  const short = formatShortDate(startsAt, tz);
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/** "Amanhã: Noite de samba às 20:00" */
export function reminderTitle(event: { title: string; startsAt: Date; timezone: string }, now: Date): string {
  return `${reminderDayLabel(event.startsAt, now, event.timezone)}: ${event.title} às ${formatTime(event.startsAt, event.timezone)}`;
}

export interface RemindersResult {
  events: number;
  sent: number;
  failed: number;
  windowHours: number;
}

/**
 * Envia um lembrete (in-app + e-mail + push, conforme preferências) a quem marcou
 * "Vou" ou "Tenho interesse". Idempotente: cada presença é "reivindicada" de forma
 * atômica (reminderSentAt) antes do envio, então execuções simultâneas ou repetidas
 * nunca mandam o mesmo lembrete duas vezes.
 */
export async function runReminders(now: Date = new Date()): Promise<RemindersResult> {
  const until = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3_600_000);
  const where: Prisma.EventRsvpWhereInput = {
    reminderSentAt: null,
    status: { in: ["GOING", "INTERESTED"] },
    user: { status: "ACTIVE" },
    event: { status: "PUBLISHED", organization: { status: "ACTIVE" }, startsAt: { gt: now, lte: until } },
  };

  const events = new Set<string>();
  const failedKeys = new Set<string>();
  let sent = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rsvps = await prisma.eventRsvp.findMany({
      where,
      select: {
        userId: true,
        eventId: true,
        event: { select: { slug: true, title: true, startsAt: true, timezone: true, venueName: true, neighborhood: true, city: true } },
      },
      orderBy: [{ eventId: "asc" }, { userId: "asc" }],
      take: BATCH,
    });
    const pending = rsvps.filter((r) => !failedKeys.has(`${r.eventId}:${r.userId}`));
    if (!pending.length) break;

    for (const r of pending) {
      const key = { userId: r.userId, eventId: r.eventId };
      const claimed = await prisma.eventRsvp.updateMany({ where: { ...key, reminderSentAt: null }, data: { reminderSentAt: now } });
      if (!claimed.count) continue;

      const e = r.event;
      const title = reminderTitle(e, now);
      const place = [e.venueName, e.neighborhood ?? e.city].filter(Boolean).join(" · ");
      const url = `/evento/${e.slug}`;
      try {
        await notify(
          r.userId,
          { type: "EVENT_REMINDER", title, body: place, url },
          {
            email: genericMessage({
              template: "event-reminder",
              subject: title,
              heading: title,
              paragraphs: [place, "Confira os detalhes, o trajeto e os ingressos na página do evento."],
              cta: { label: "Ver evento", path: url },
              footnote: "Você recebeu este lembrete porque marcou presença ou interesse neste evento no Mixtour.",
            }),
          },
        );
        sent++;
        events.add(r.eventId);
      } catch (err) {
        console.error("[jobs:reminders] falha ao notificar", r.eventId, r.userId, err);
        failedKeys.add(`${r.eventId}:${r.userId}`);
        // Devolve para a fila: a próxima execução tenta de novo.
        await prisma.eventRsvp.updateMany({ where: key, data: { reminderSentAt: null } }).catch(() => undefined);
      }
    }
    if (rsvps.length < BATCH) break;
  }

  return { events: events.size, sent, failed: failedKeys.size, windowHours: REMINDER_WINDOW_HOURS };
}

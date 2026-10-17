import "server-only";
import { prisma } from "@/server/db";
import { genericMessage } from "@/server/email/templates";
import { notify } from "@/server/notifications";
import { formatDateTime } from "@/lib/format";

/**
 * Ganchos do ciclo de vida de eventos — chame-os sempre que o estado mudar,
 * seja pelo painel (publicação direta), seja pela moderação (aprovação).
 */

/** Evento passou a ser público: avisa os seguidores do organizador (uma única vez por evento). */
export async function onEventPublished(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, slug: true, title: true, status: true, startsAt: true, timezone: true, organizationId: true, organization: { select: { name: true, status: true } } },
  });
  if (!event || event.status !== "PUBLISHED" || event.organization.status !== "ACTIVE") return { notified: 0 };

  const url = `/evento/${event.slug}`;
  const [followers, already] = await Promise.all([
    prisma.follow.findMany({ where: { organizationId: event.organizationId, user: { status: "ACTIVE" } }, select: { userId: true } }),
    prisma.notification.findMany({ where: { type: "NEW_EVENT_FROM_FOLLOWED", url }, select: { userId: true } }),
  ]);
  const skip = new Set(already.map((n) => n.userId));
  const targets = followers.map((f) => f.userId).filter((id) => !skip.has(id));
  for (const userId of targets) {
    await notify(userId, {
      type: "NEW_EVENT_FROM_FOLLOWED",
      title: `${event.organization.name} publicou um novo evento`,
      body: `${event.title} — ${formatDateTime(event.startsAt, event.timezone)}`,
      url,
    });
  }
  return { notified: targets.length };
}

/**
 * Evento alterado (data/local) ou cancelado: avisa quem marcou "Vou"/"Tenho interesse"
 * e, no cancelamento, também quem salvou. E-mail só para mudanças relevantes.
 */
export async function onEventChanged(eventId: string, kind: "updated" | "canceled", detail?: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, slug: true, title: true, startsAt: true, timezone: true, venueName: true },
  });
  if (!event) return { notified: 0 };
  const url = `/evento/${event.slug}`;
  const [rsvps, saves] = await Promise.all([
    prisma.eventRsvp.findMany({ where: { eventId }, select: { userId: true } }),
    kind === "canceled" ? prisma.eventSave.findMany({ where: { eventId }, select: { userId: true } }) : Promise.resolve([]),
  ]);
  const userIds = [...new Set([...rsvps, ...saves].map((r) => r.userId))];

  const title = kind === "canceled" ? `Evento cancelado: ${event.title}` : `Mudança em ${event.title}`;
  const body =
    kind === "canceled"
      ? "O organizador cancelou este evento. Confira os detalhes e outras opções perto de você."
      : detail ?? `Agora: ${formatDateTime(event.startsAt, event.timezone)} · ${event.venueName}`;

  for (const userId of userIds) {
    await notify(
      userId,
      { type: kind === "canceled" ? "EVENT_CANCELED" : "EVENT_UPDATED", title, body, url },
      {
        email: genericMessage({
          template: kind === "canceled" ? "event-canceled" : "event-updated",
          subject: title,
          heading: title,
          paragraphs: [body],
          cta: { label: "Ver evento", path: url },
        }),
      },
    );
  }
  return { notified: userIds.length };
}

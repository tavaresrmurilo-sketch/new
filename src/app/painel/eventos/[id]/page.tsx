import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventEditor } from "@/components/painel/editor/event-editor";
import { prisma } from "@/server/db";
import { editorContext } from "@/server/events/editor-data";
import { eventForEditor, panelStatus } from "@/server/events/organizer-queries";
import { requireCurrentOrg } from "@/server/organizations/current";
import { eventToFormValues, isUnsetDate } from "@/lib/validation/event";

export const metadata: Metadata = { title: "Editar evento" };

export default async function EditarEventoPage({ params }: PageProps<"/painel/eventos/[id]">) {
  const { id } = await params;
  const ctx = await requireCurrentOrg();
  const event = await eventForEditor(ctx.org.id, id);
  if (!event) notFound();
  const data = await editorContext(ctx);
  // A categoria do evento pode ter sido desativada depois: continua disponível para ele.
  if (!data.categories.some((c) => c.id === event.categoryId)) {
    const cat = await prisma.category.findUnique({ where: { id: event.categoryId }, select: { id: true, slug: true, name: true, icon: true, color: true } });
    if (cat) data.categories.push(cat);
  }
  const ps = panelStatus(event.status, event.endsAt);
  return (
    <EventEditor
      key={event.id}
      eventId={event.id}
      slug={event.slug}
      organizationId={ctx.org.id}
      org={data.org}
      status={event.status}
      panelStatus={ps}
      rejectionReason={event.rejectionReason}
      initial={eventToFormValues(event)}
      originalStart={isUnsetDate(event.startsAt) ? null : event.startsAt.toISOString()}
      categories={data.categories}
      venues={data.venues}
      needsReview={data.needsReview}
      emailBlocked={data.emailBlocked}
      quota={data.quota}
      actionEvent={{
        id: event.id,
        slug: event.slug,
        title: event.title,
        status: event.status,
        panelStatus: ps,
        featured: Boolean(event.featuredUntil && event.featuredUntil > new Date()),
        featuredUntil: event.featuredUntil?.toISOString() ?? null,
        timezone: event.timezone,
        going: event.goingCount,
        saves: event.savesCount,
      }}
    />
  );
}

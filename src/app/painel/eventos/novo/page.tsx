import type { Metadata } from "next";
import { EventEditor } from "@/components/painel/editor/event-editor";
import { editorContext } from "@/server/events/editor-data";
import { requireCurrentOrg } from "@/server/organizations/current";
import { emptyEventForm } from "@/lib/validation/event";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NovoEventoPage() {
  const ctx = await requireCurrentOrg();
  const data = await editorContext(ctx);
  const initial = emptyEventForm();
  if (ctx.org.city) initial.city = ctx.org.city;
  if (ctx.org.state) initial.state = ctx.org.state;
  return (
    <EventEditor
      organizationId={ctx.org.id}
      org={data.org}
      initial={initial}
      categories={data.categories}
      venues={data.venues}
      needsReview={data.needsReview}
      emailBlocked={data.emailBlocked}
      quota={data.quota}
    />
  );
}

"use client";

import { CircleCheck, CircleDashed, Lightbulb, TriangleAlert } from "lucide-react";
import { EventCard } from "@/components/events/event-card";
import type { CategoryDTO } from "@/lib/categories";
import type { EventCardData } from "@/lib/events";
import { parseLocalDateTime, toLocalInputs } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EDITOR_STEPS, parseMoneyToCents, type EditorStep, type EventFormValues, type PublishProblem } from "@/lib/validation/event";

export interface PreviewOrg {
  name: string;
  slug: string;
  verified: boolean;
  logoUrl: string | null;
}

const FALLBACK_CATEGORY = { slug: "outros", name: "Categoria", icon: "sparkles", color: "#8A7E72" };

/** Monta o card público a partir do que está no formulário (sem salvar). */
export function toPreviewCard(values: EventFormValues, categories: CategoryDTO[], org: PreviewOrg, slug: string): { card: EventCardData; sampleDate: boolean } {
  const cat = categories.find((c) => c.id === values.categoryId);
  const start = parseLocalDateTime(values.startDate, values.startTime, values.timezone);
  const end = parseLocalDateTime(values.endDate, values.endTime, values.timezone);
  // Data de exemplo estável (amanhã, 20h) para o card não mudar entre servidor e navegador.
  const sampleStart = start ?? parseLocalDateTime(toLocalInputs(new Date(Date.now() + 86_400_000), values.timezone).date, "20:00", values.timezone)!;
  return {
    sampleDate: !start,
    card: {
      id: "preview",
      slug,
      title: values.title.trim() || "Nome do seu evento",
      coverUrl: values.coverUrl || null,
      coverThumbUrl: values.coverThumbUrl || null,
      coverColor: values.coverColor || null,
      startsAt: sampleStart.toISOString(),
      endsAt: (end && end > sampleStart ? end : new Date(sampleStart.getTime() + 3 * 3_600_000)).toISOString(),
      timezone: values.timezone,
      venueName: values.venueName.trim() || "Local a definir",
      neighborhood: values.neighborhood.trim() || null,
      city: values.city.trim() || "",
      state: values.state || null,
      lat: values.lat ?? 0,
      lng: values.lng ?? 0,
      isFree: values.isFree,
      priceMinCents: values.isFree ? null : parseMoneyToCents(values.priceMin),
      priceMaxCents: values.isFree ? null : parseMoneyToCents(values.priceMax),
      featured: false,
      goingCount: 0,
      savesCount: 0,
      category: cat ? { slug: cat.slug, name: cat.name, icon: cat.icon, color: cat.color } : FALLBACK_CATEGORY,
      organizer: org,
      distanceKm: null,
    },
  };
}

/** Prévia ao vivo (não clicável). */
export function CardPreview({ card, sampleDate, className }: { card: EventCardData; sampleDate: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="pointer-events-none select-none" inert>
        <EventCard event={card} variant="tile" />
      </div>
      {sampleDate && <p className="text-xs text-subtle-foreground">A data do card é um exemplo até você definir o horário.</p>}
    </div>
  );
}

export interface Recommendation {
  id: string;
  label: string;
  step: EditorStep;
}

export function recommendations(values: EventFormValues): Recommendation[] {
  const out: Recommendation[] = [];
  if (!values.coverUrl) out.push({ id: "cover", label: "Adicione uma imagem de capa — eventos com foto chamam mais atenção", step: "imagem" });
  if (!values.summary.trim()) out.push({ id: "summary", label: "Escreva um resumo curto para os cards", step: "basico" });
  if (values.description.trim().length < 60) out.push({ id: "description", label: "Conte mais na descrição (programação, atrações)", step: "basico" });
  if (!values.ticketUrl && !values.isFree) out.push({ id: "ticket", label: "Inclua o link de ingressos", step: "ingressos" });
  return out;
}

/** Checklist do que falta para publicar + recomendações. */
export function PublishChecklist({
  problems,
  recs,
  onGo,
  compact,
}: {
  problems: PublishProblem[];
  recs: Recommendation[];
  onGo: (step: EditorStep, field?: string) => void;
  compact?: boolean;
}) {
  const stepLabel = (s: EditorStep) => EDITOR_STEPS.find((x) => x.id === s)?.label ?? "";
  const unique = problems.filter((p, i) => problems.findIndex((q) => q.message === p.message) === i);
  return (
    <div className="flex flex-col gap-4">
      {unique.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-2xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
          <CircleCheck className="size-5 shrink-0" /> Tudo pronto para publicar
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-bold">
            <TriangleAlert className="size-4 text-warning" /> Falta para publicar
          </p>
          <ul className="mt-1 flex flex-col">
            {unique.map((p) => (
              <li key={p.field + p.message}>
                <button
                  type="button"
                  onClick={() => onGo(p.step, p.field)}
                  className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 text-left text-sm transition hover:bg-surface-2"
                >
                  <CircleDashed className="size-4 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 font-medium">{p.message}</span>
                  {!compact && <span className="shrink-0 text-xs text-subtle-foreground">{stepLabel(p.step)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {recs.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Lightbulb className="size-4 text-primary" /> Recomendado
          </p>
          <ul className="mt-1 flex flex-col">
            {recs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onGo(r.step)}
                  className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 text-left text-sm text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 flex-1">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

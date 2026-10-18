"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  CircleAlert,
  Eye,
  Hourglass,
  Info,
  MailWarning,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { SavedVenue } from "@/components/map/location-picker";
import { EventActions, type ActionEvent, type BoostQuota } from "@/components/painel/event-actions";
import { ResendVerificationButton } from "@/components/painel/resend-verification";
import { StatusBadge, type PanelStatusValue } from "@/components/painel/status-badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import type { CategoryDTO } from "@/lib/categories";
import { cn } from "@/lib/utils";
import {
  EDITOR_STEPS,
  eventDraftSchema,
  FIELD_STEP,
  publishProblems,
  type EditorStep,
  type EventFormValues,
  type PublishProblem,
} from "@/lib/validation/event";
import { saveEventAction } from "@/server/events/actions";
import { CardPreview, PublishChecklist, recommendations, toPreviewCard, type PreviewOrg } from "./preview";
import { BasicSection, DatesSection, DetailsSection, fid, ImageSection, LocationSection, TicketsSection, type Errors } from "./sections";

type Status = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "REJECTED" | "CANCELED" | "ARCHIVED";

export interface EventEditorProps {
  eventId?: string;
  slug?: string;
  organizationId: string;
  org: PreviewOrg;
  status?: Status;
  panelStatus?: PanelStatusValue;
  rejectionReason?: string | null;
  initial: EventFormValues;
  /** Início original (ISO) — evento em andamento pode ser corrigido sem mexer no início. */
  originalStart?: string | null;
  categories: CategoryDTO[];
  venues: SavedVenue[];
  needsReview: boolean;
  emailBlocked: boolean;
  quota: BoostQuota;
  actionEvent?: ActionEvent;
}

const STEP_INFO: Record<EditorStep, { title: string; description: string }> = {
  basico: { title: "O básico", description: "Nome, categoria e o que as pessoas vão encontrar." },
  datas: { title: "Data e horário", description: "Quando começa e quando termina, no horário local." },
  local: { title: "Local", description: "Onde o evento acontece — é o que coloca o pino no mapa." },
  ingressos: { title: "Ingressos", description: "Entrada gratuita ou paga, e onde comprar." },
  detalhes: { title: "Detalhes", description: "Classificação, acessibilidade e tags." },
  imagem: { title: "Imagem de capa", description: "A primeira coisa que o público vê no mapa e nas listas." },
  revisao: { title: "Revisão", description: "Confira como o evento vai aparecer antes de publicar." },
};

const LOCATION_FIELDS = new Set(["venueName", "address", "neighborhood", "city", "state", "postalCode"]);

function elementIdFor(field: string) {
  if (LOCATION_FIELDS.has(field)) return `ev-loc-${field}`;
  if (field === "location") return "ev-loc-search";
  return fid(field);
}

function stepDone(step: EditorStep, v: EventFormValues): boolean {
  switch (step) {
    case "basico":
      return v.title.trim().length >= 3 && Boolean(v.categoryId);
    case "datas":
      return Boolean(v.startDate && v.startTime && v.endDate && v.endTime);
    case "local":
      return Boolean(v.venueName.trim() && v.address.trim() && v.city.trim() && v.lat != null);
    case "ingressos":
      return v.isFree || Boolean(v.priceMin);
    case "detalhes":
      return v.accessibility.length > 0 || v.tags.length > 0 || v.ageRating !== "LIVRE";
    case "imagem":
      return Boolean(v.coverUrl);
    default:
      return false;
  }
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "_");
    out[k] ??= i.message;
  }
  return out;
}

/** Editor de evento: etapas no celular; seções + prévia ao vivo no desktop. */
export function EventEditor(props: EventEditorProps) {
  const router = useRouter();
  const [values, setValues] = useState<EventFormValues>(props.initial);
  const [errors, setErrors] = useState<Errors>({});
  const [step, setStep] = useState<EditorStep>("basico");
  const [activeSection, setActiveSection] = useState<EditorStep>("basico");
  const [venues, setVenues] = useState<SavedVenue[]>(props.venues);
  const [eventId, setEventId] = useState(props.eventId);
  const [status, setStatus] = useState<Status | undefined>(props.status);
  const [notice, setNotice] = useState<{ kind: "email" | "plan"; message: string } | null>(props.emailBlocked ? { kind: "email", message: "" } : null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [intentPending, setIntentPending] = useState<"draft" | "publish" | "save" | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const readOnly = status === "CANCELED" || status === "ARCHIVED" || props.panelStatus === "ENDED";
  const live = status === "PUBLISHED" || status === "PENDING_REVIEW";
  const stepIndex = EDITOR_STEPS.findIndex((s) => s.id === step);
  const category = props.categories.find((c) => c.id === values.categoryId);

  const set = useCallback((patch: Partial<EventFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setDirty(true);
    setErrors((e) => {
      const keys = Object.keys(patch);
      if (!keys.some((k) => e[k] || (LOCATION_FIELDS.has(k) && e.location) || ((k === "lat" || k === "lng") && e.location))) return e;
      const next = { ...e };
      for (const k of keys) delete next[k];
      if (keys.includes("lat")) delete next.location;
      if (keys.includes("startDate") || keys.includes("startTime")) delete next.endTime;
      return next;
    });
  }, []);

  // Aviso ao sair com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Seção visível no desktop (navegação lateral).
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.getAttribute("data-step") as EditorStep);
      },
      { rootMargin: "-20% 0px -60% 0px" },
    );
    document.querySelectorAll("[data-step]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const problems: PublishProblem[] = useMemo(() => {
    // Checagem tolerante: título/categoria ausentes não escondem o resto do que falta.
    const out: PublishProblem[] = [];
    if (values.title.trim().length < 3) out.push({ field: "title", message: "Dê um nome ao evento", step: "basico" });
    if (!values.categoryId) out.push({ field: "categoryId", message: "Escolha uma categoria", step: "basico" });
    const res = eventDraftSchema.safeParse({ ...values, title: out.some((p) => p.field === "title") ? "Sem nome" : values.title, categoryId: values.categoryId || "-" });
    if (!res.success) {
      for (const i of res.error.issues) {
        const field = String(i.path[0] ?? "");
        out.push({ field, message: i.message, step: FIELD_STEP[field] ?? "local" });
      }
      return out;
    }
    const startUnchanged = props.originalStart && res.data.startsAt?.toISOString() === props.originalStart;
    return out.concat(publishProblems(res.data).filter((p) => !(startUnchanged && p.code === "start_past")));
  }, [values, props.originalStart]);
  const recs = useMemo(() => recommendations(values), [values]);
  const preview = useMemo(() => toPreviewCard(values, props.categories, props.org, props.slug ?? "previa"), [values, props.categories, props.org, props.slug]);

  const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

  function focusField(field: string) {
    requestAnimationFrame(() => {
      const el = document.getElementById(elementIdFor(field));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    });
  }

  function goTo(target: EditorStep, field?: string) {
    if (isDesktop()) {
      if (field) focusField(field);
      else document.getElementById(`sec-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setStep(target);
    if (field) focusField(field);
    else requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
  }

  function showErrors(errs: Errors) {
    setErrors(errs);
    const order = Object.keys(FIELD_STEP).concat("location");
    const first = order.find((f) => errs[f]) ?? Object.keys(errs)[0];
    if (first) goTo(FIELD_STEP[first] ?? "local", first);
  }

  function next() {
    // Valida o formato do que foi preenchido nesta etapa antes de avançar.
    const res = eventDraftSchema.safeParse(values);
    const errs = res.success ? {} : toFieldErrors(res.error.issues);
    const here = Object.fromEntries(Object.entries(errs).filter(([k]) => (FIELD_STEP[k] ?? (k === "location" ? "local" : null)) === step));
    if (Object.keys(here).length) {
      setErrors((e) => ({ ...e, ...here }));
      const first = Object.keys(here)[0];
      focusField(first);
      return;
    }
    const n = EDITOR_STEPS[Math.min(EDITOR_STEPS.length - 1, stepIndex + 1)];
    setStep(n.id);
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }

  function back() {
    const p = EDITOR_STEPS[Math.max(0, stepIndex - 1)];
    setStep(p.id);
    requestAnimationFrame(() => window.scrollTo({ top: 0 }));
  }

  function save(intent: "draft" | "publish" | "save") {
    // Validação imediata no cliente (o servidor valida de novo).
    const res = eventDraftSchema.safeParse(values);
    if (!res.success) {
      showErrors(toFieldErrors(res.error.issues));
      toast.error("Revise os campos destacados.");
      return;
    }
    if (intent !== "draft" && problems.length) {
      const errs: Errors = {};
      for (const p of problems) errs[p.field] ??= p.message;
      showErrors(errs);
      toast.error(intent === "publish" ? "Faltam algumas informações para publicar." : "Complete as informações obrigatórias para manter o evento no ar.");
      return;
    }
    setIntentPending(intent);
    start(async () => {
      const r = await saveEventAction({ eventId, organizationId: props.organizationId, intent, values });
      setIntentPending(null);
      if (r.status === "success" && r.data) {
        setDirty(false);
        setErrors({});
        setNotice(null);
        setStatus(r.data.status);
        toast.success(r.message ?? "Salvo.");
        if (intent === "publish") {
          router.push(`/painel/eventos?status=${r.data.status === "PUBLISHED" ? "publicados" : "analise"}`);
          return;
        }
        if (!eventId) {
          setEventId(r.data.eventId);
          window.history.replaceState(null, "", `/painel/eventos/${r.data.eventId}`);
        }
        router.refresh();
        return;
      }
      if (r.status !== "error") return;
      const fe = r.fieldErrors ?? {};
      if (fe._eventId && !eventId) {
        setEventId(fe._eventId);
        setStatus("DRAFT");
        setDirty(false);
        window.history.replaceState(null, "", `/painel/eventos/${fe._eventId}`);
      }
      if (fe._code === "EMAIL_UNVERIFIED") {
        setNotice({ kind: "email", message: r.message });
        goTo("revisao");
        return;
      }
      if (fe._code === "PLAN_LIMIT") {
        setNotice({ kind: "plan", message: r.message });
        goTo("revisao");
        return;
      }
      const fieldErrs = Object.fromEntries(Object.entries(fe).filter(([k]) => !k.startsWith("_")));
      if (Object.keys(fieldErrs).length) showErrors(fieldErrs);
      toast.error(r.message);
    });
  }

  const publishLabel = live
    ? "Salvar alterações"
    : props.needsReview
      ? status === "REJECTED"
        ? "Reenviar para análise"
        : "Enviar para análise"
      : "Publicar";
  const primaryIntent: "publish" | "save" = live ? "save" : "publish";
  const emailBlocked = notice?.kind === "email" && !live;

  const sections: { id: EditorStep; node: React.ReactNode }[] = [
    { id: "basico", node: <BasicSection values={values} set={set} errors={errors} categories={props.categories} /> },
    { id: "datas", node: <DatesSection values={values} set={set} errors={errors} /> },
    {
      id: "local",
      node: (
        <LocationSection
          values={values}
          set={set}
          errors={errors}
          venues={venues}
          organizationId={props.organizationId}
          onVenueSaved={(v) => setVenues((list) => [...list, v].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")))}
          color={category?.color}
        />
      ),
    },
    { id: "ingressos", node: <TicketsSection values={values} set={set} errors={errors} /> },
    { id: "detalhes", node: <DetailsSection values={values} set={set} errors={errors} /> },
    { id: "imagem", node: <ImageSection values={values} set={set} errors={errors} organizationId={props.organizationId} /> },
  ];

  const noticeBox = notice && (notice.kind === "plan" || emailBlocked) && (
    <Alert
      tone="warning"
      icon={notice.kind === "email" ? <MailWarning /> : <Sparkles />}
      title={notice.kind === "email" ? "Confirme seu e-mail para publicar" : "Limite do plano atingido"}
      action={
        notice.kind === "email" ? (
          <ResendVerificationButton />
        ) : (
          <Button asChild size="sm" variant="primary">
            <Link href="/painel/plano">
              <Sparkles /> Ver planos
            </Link>
          </Button>
        )
      }
    >
      {notice.message || "Você pode salvar o rascunho agora e publicar assim que confirmar o e-mail pelo link que enviamos."}
    </Alert>
  );

  const statusAlert =
    status === "REJECTED" ? (
      <Alert tone="danger" icon={<CircleAlert />} title="A equipe Mixtour pediu ajustes">
        {props.rejectionReason ? `Motivo: ${props.rejectionReason}. ` : ""}Faça as correções e reenvie para análise.
      </Alert>
    ) : status === "PENDING_REVIEW" ? (
      <Alert tone="info" icon={<Hourglass />} title="Em análise">
        Normalmente a análise é rápida. Você pode continuar editando — as alterações seguem para a mesma análise.
      </Alert>
    ) : status === "PUBLISHED" && !readOnly ? (
      <Alert tone="neutral" icon={<Info />}>
        Este evento está no ar. Se você mudar a data, o horário ou o local, avisaremos quem marcou “vou”.
      </Alert>
    ) : readOnly ? (
      <Alert tone="neutral" icon={<Info />} title={status === "CANCELED" ? "Evento cancelado" : "Evento encerrado"}>
        Eventos {status === "CANCELED" ? "cancelados" : "encerrados"} não podem ser editados. Use “Duplicar” para criar uma nova edição.
      </Alert>
    ) : null;

  const review = (
    <div className="flex flex-col gap-6">
      <div className="xl:hidden">
        <CardPreview card={preview.card} sampleDate={preview.sampleDate} className="mx-auto max-w-sm" />
      </div>
      {!readOnly && <PublishChecklist problems={problems} recs={recs} onGo={goTo} />}
      {!readOnly && !live && (
        <p className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted-foreground">
          <Eye className="mt-0.5 size-4 shrink-0 text-primary" />
          {props.needsReview
            ? "Novos organizadores passam por uma análise rápida da equipe Mixtour antes de aparecer no mapa. Avisamos você por e-mail."
            : "Ao publicar, o evento aparece na hora no mapa e avisamos quem segue sua organização."}
        </p>
      )}
    </div>
  );

  const busy = pending;
  const draftLabel = live ? null : "Salvar rascunho";

  return (
    <div ref={topRef} className="scroll-mt-0">
      {/* Topo no celular */}
      <div className="safe-top sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center gap-1 px-2">
          <Link href="/painel/eventos" aria-label="Voltar para eventos" className="grid size-11 place-items-center rounded-full hover:bg-surface-2">
            <ChevronLeft className="size-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] leading-tight font-bold">{eventId ? "Editar evento" : "Novo evento"}</p>
            <p className="truncate text-xs text-muted-foreground">
              Etapa {stepIndex + 1} de {EDITOR_STEPS.length} · {EDITOR_STEPS[stepIndex].label}
            </p>
          </div>
          {!readOnly && (
            <Button type="button" variant="ghost" size="sm" onClick={() => save(live ? "save" : "draft")} loading={intentPending === "draft" || intentPending === "save"} disabled={busy}>
              <Save /> Salvar
            </Button>
          )}
          {props.actionEvent && <EventActions event={props.actionEvent} quota={props.quota} />}
        </div>
        <div className="flex gap-1 px-4 pb-3" role="list" aria-label="Etapas">
          {EDITOR_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="listitem"
              onClick={() => goTo(s.id)}
              aria-label={`Etapa ${i + 1}: ${s.label}`}
              aria-current={s.id === step ? "step" : undefined}
              className="group flex h-5 flex-1 items-center"
            >
              <span className={cn("h-1.5 w-full rounded-full transition", i < stepIndex ? "bg-primary" : i === stepIndex ? "bg-brand-gradient" : "bg-surface-3")} />
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 pt-5 pb-32 sm:px-6 lg:px-10 lg:pt-8 lg:pb-16">
        {/* Cabeçalho no desktop */}
        <div className="hidden items-center gap-4 lg:flex">
          <Link href="/painel/eventos" className="inline-flex items-center gap-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Eventos
          </Link>
        </div>
        <div className="mt-2 hidden items-start justify-between gap-6 lg:flex">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-3xl font-extrabold tracking-tight">{values.title.trim() || (eventId ? "Editar evento" : "Novo evento")}</h1>
              {status && <StatusBadge status={props.panelStatus === "ENDED" ? "ENDED" : status} />}
            </div>
            <p className="mt-1.5 text-[15px] text-muted-foreground">{dirty ? "Alterações não salvas" : eventId ? "Tudo salvo" : "Preencha as seções e publique quando estiver pronto."}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {props.actionEvent && <EventActions event={props.actionEvent} quota={props.quota} />}
            {!readOnly && draftLabel && (
              <Button type="button" variant="outline" onClick={() => save("draft")} loading={intentPending === "draft"} disabled={busy}>
                <Save /> {draftLabel}
              </Button>
            )}
            {!readOnly && (
              <Button type="button" variant="primary" onClick={() => save(primaryIntent)} loading={intentPending === primaryIntent} disabled={busy}>
                {live ? <Check /> : <Send />} {publishLabel}
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 empty:hidden lg:mt-6">
          {statusAlert}
          {noticeBox}
        </div>

        <div className="mt-5 lg:mt-8 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[11rem_minmax(0,1fr)_20rem]">
          {/* Navegação das seções (desktop) */}
          <nav aria-label="Seções do evento" className="hidden lg:block">
            <ul className="sticky top-8 flex flex-col gap-0.5">
              {EDITOR_STEPS.map((s) => {
                const hasError = Object.keys(errors).some((k) => (FIELD_STEP[k] ?? (k === "location" ? "local" : null)) === s.id);
                const done = stepDone(s.id, values);
                const active = activeSection === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => goTo(s.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-semibold transition",
                        active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-full border text-[10px]",
                          hasError ? "border-danger bg-danger text-white" : done ? "border-success bg-success text-white" : "border-border-strong",
                        )}
                        aria-hidden
                      >
                        {hasError ? "!" : done ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-6">
            <legend className="sr-only">Dados do evento</legend>
            {[...sections, { id: "revisao" as EditorStep, node: review }].map((s) => (
              <section
                key={s.id}
                id={`sec-${s.id}`}
                data-step={s.id}
                aria-labelledby={`sec-${s.id}-title`}
                className={cn("scroll-mt-8 lg:rounded-3xl lg:border lg:border-border lg:bg-surface lg:p-7 lg:shadow-card", s.id !== step && "max-lg:hidden")}
              >
                <div className="mb-5">
                  <h2 id={`sec-${s.id}-title`} className="text-xl font-extrabold tracking-tight lg:text-lg">
                    {STEP_INFO[s.id].title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{STEP_INFO[s.id].description}</p>
                </div>
                {s.node}
              </section>
            ))}
          </fieldset>

          {/* Prévia ao vivo (desktop largo) */}
          <aside className="hidden xl:block" aria-label="Prévia do card">
            <div className="sticky top-8 flex flex-col gap-5">
              <div>
                <p className="mb-3 text-xs font-bold tracking-wide text-subtle-foreground uppercase">Prévia ao vivo</p>
                <CardPreview card={preview.card} sampleDate={preview.sampleDate} />
              </div>
              {!readOnly && (
                <div className="rounded-3xl border border-border bg-surface p-5 shadow-card">
                  <PublishChecklist problems={problems} recs={recs.slice(0, 3)} onGo={goTo} compact />
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* Ações fixas no celular */}
      <div className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border lg:hidden">
        <div className="mx-auto flex max-w-lg gap-2.5 px-4 py-3">
          {step === "revisao" && !readOnly ? (
            <>
              {draftLabel ? (
                <Button type="button" variant="secondary" size="lg" className="flex-1 px-4" onClick={() => save("draft")} loading={intentPending === "draft"} disabled={busy}>
                  {draftLabel}
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="lg" className="px-5" onClick={back} disabled={busy} aria-label="Voltar">
                  <ArrowLeft />
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="lg"
                className="flex-1 px-4"
                onClick={() => save(primaryIntent)}
                loading={intentPending === primaryIntent}
                disabled={busy}
              >
                {publishLabel}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={back} disabled={stepIndex === 0}>
                <ArrowLeft /> Voltar
              </Button>
              <Button type="button" variant={step === "revisao" ? "secondary" : "primary"} size="lg" className="flex-1" onClick={next} disabled={step === "revisao"}>
                Continuar <ArrowRight />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

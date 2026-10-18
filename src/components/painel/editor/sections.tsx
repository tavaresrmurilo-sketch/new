"use client";

import { Accessibility, Clock, Plus, Ticket, X } from "lucide-react";
import { useState } from "react";
import { CategoryIcon } from "@/components/events/category-icon";
import { LocationPicker, type LocationValue, type SavedVenue } from "@/components/map/location-picker";
import { ImageUpload } from "@/components/upload/image-upload";
import { Segmented } from "@/components/ui/chip";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { CategoryDTO } from "@/lib/categories";
import { ACCESSIBILITY_OPTIONS, AGE_RATINGS } from "@/lib/constants";
import { parseLocalDateTime } from "@/lib/dates";
import { eventWhenLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BR_TIMEZONES,
  DESCRIPTION_MAX,
  MAX_TAGS,
  normalizeTag,
  suggestEnd,
  SUMMARY_MAX,
  TITLE_MAX,
  type EventFormValues,
} from "@/lib/validation/event";

export type Errors = Record<string, string | undefined>;
export type SetValues = (patch: Partial<EventFormValues>) => void;

interface SectionProps {
  values: EventFormValues;
  set: SetValues;
  errors: Errors;
}

export const fid = (name: string) => `ev-${name}`;

function aria(errors: Errors, name: string) {
  return errors[name] ? { "aria-invalid": true as const, "aria-describedby": `${fid(name)}-error` } : {};
}

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return <span className={cn("tabular-nums", n > max ? "text-danger" : n > max * 0.9 ? "text-warning" : "")}>{n}/{max}</span>;
}

export function BasicSection({ values, set, errors, categories }: SectionProps & { categories: CategoryDTO[] }) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="Nome do evento" htmlFor={fid("title")} error={errors.title} hint={<Counter value={values.title} max={TITLE_MAX} />}>
        <Input
          id={fid("title")}
          value={values.title}
          maxLength={TITLE_MAX}
          placeholder="Ex.: Roda de samba no Largo"
          onChange={(e) => set({ title: e.target.value })}
          {...aria(errors, "title")}
        />
      </Field>

      <fieldset className="flex flex-col gap-3" aria-describedby={errors.categoryId ? `${fid("categoryId")}-error` : undefined}>
        <legend className="mb-1 text-sm font-semibold">Categoria</legend>
        <div id={fid("categoryId")} tabIndex={-1} className="grid grid-cols-2 gap-2 outline-none sm:grid-cols-3">
          {categories.map((c) => {
            const active = values.categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => set({ categoryId: c.id })}
                className={cn(
                  "flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left text-[13px] leading-tight font-semibold transition",
                  active ? "border-transparent text-white shadow-card" : "border-border bg-surface hover:border-border-strong",
                )}
                style={active ? { background: c.color } : undefined}
              >
                <span
                  className={cn("grid size-8 shrink-0 place-items-center rounded-xl", active ? "bg-white/20" : "")}
                  style={active ? undefined : { color: c.color, background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}
                >
                  <CategoryIcon icon={c.icon} className="size-4" />
                </span>
                <span className="min-w-0">{c.name}</span>
              </button>
            );
          })}
        </div>
        {errors.categoryId && (
          <p id={`${fid("categoryId")}-error`} role="alert" className="text-[13px] font-medium text-danger">
            {errors.categoryId}
          </p>
        )}
      </fieldset>

      <Field
        label="Resumo"
        htmlFor={fid("summary")}
        optional
        error={errors.summary}
        hint={
          <span className="flex justify-between gap-3">
            <span>Aparece nos cards e nas buscas.</span>
            <Counter value={values.summary} max={SUMMARY_MAX} />
          </span>
        }
      >
        <Textarea
          id={fid("summary")}
          rows={2}
          value={values.summary}
          maxLength={SUMMARY_MAX}
          placeholder="Uma frase que faça a pessoa querer ir."
          onChange={(e) => set({ summary: e.target.value })}
          {...aria(errors, "summary")}
        />
      </Field>

      <Field
        label="Descrição"
        htmlFor={fid("description")}
        optional
        error={errors.description}
        hint={
          <span className="flex justify-between gap-3">
            <span>Programação, atrações, o que levar, regras de entrada…</span>
            <Counter value={values.description} max={DESCRIPTION_MAX} />
          </span>
        }
      >
        <Textarea
          id={fid("description")}
          rows={7}
          value={values.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => set({ description: e.target.value })}
          {...aria(errors, "description")}
        />
      </Field>
    </div>
  );
}

function durationLabel(values: EventFormValues): string | null {
  const s = parseLocalDateTime(values.startDate, values.startTime, values.timezone);
  const e = parseLocalDateTime(values.endDate, values.endTime, values.timezone);
  if (!s || !e || e <= s) return null;
  const mins = Math.round((e.getTime() - s.getTime()) / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [days ? `${days} ${days === 1 ? "dia" : "dias"}` : "", hours ? `${hours} h` : "", m ? `${m} min` : ""].filter(Boolean);
  return `${eventWhenLabel(s, e, new Date(), values.timezone)} · duração de ${parts.join(" e ")}`;
}

export function DatesSection({ values, set, errors }: SectionProps) {
  const summary = durationLabel(values);
  const changeStart = (patch: Partial<EventFormValues>) => {
    const next = { ...values, ...patch };
    if (!values.endDate && !values.endTime && next.startDate && next.startTime) {
      const end = suggestEnd(next.startDate, next.startTime, next.timezone);
      if (end) Object.assign(patch, { endDate: end.date, endTime: end.time });
    }
    set(patch);
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr_8.5rem] gap-3">
        <Field label="Começa em" htmlFor={fid("startDate")} error={errors.startDate}>
          <Input id={fid("startDate")} type="date" value={values.startDate} onChange={(e) => changeStart({ startDate: e.target.value })} {...aria(errors, "startDate")} />
        </Field>
        <Field label="Horário" htmlFor={fid("startTime")} error={errors.startTime}>
          <Input id={fid("startTime")} type="time" step={300} value={values.startTime} onChange={(e) => changeStart({ startTime: e.target.value })} {...aria(errors, "startTime")} />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_8.5rem] gap-3">
        <Field label="Termina em" htmlFor={fid("endDate")} error={errors.endDate}>
          <Input id={fid("endDate")} type="date" min={values.startDate || undefined} value={values.endDate} onChange={(e) => set({ endDate: e.target.value })} {...aria(errors, "endDate")} />
        </Field>
        <Field label="Horário" htmlFor={fid("endTime")} error={errors.endTime}>
          <Input id={fid("endTime")} type="time" step={300} value={values.endTime} onChange={(e) => set({ endTime: e.target.value })} {...aria(errors, "endTime")} />
        </Field>
      </div>
      <Field label="Fuso horário" htmlFor={fid("timezone")} error={errors.timezone} hint="Os horários são exibidos no fuso do local do evento.">
        <Select id={fid("timezone")} value={values.timezone} onChange={(e) => set({ timezone: e.target.value })} {...aria(errors, "timezone")}>
          {BR_TIMEZONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      {summary && (
        <p className="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
          <Clock className="size-4 shrink-0 text-primary" />
          <span className="font-medium">{summary}</span>
        </p>
      )}
    </div>
  );
}

export function LocationSection({
  values,
  set,
  errors,
  venues,
  organizationId,
  onVenueSaved,
  color,
}: SectionProps & { venues: SavedVenue[]; organizationId: string; onVenueSaved: (v: SavedVenue) => void; color?: string }) {
  const loc: LocationValue = {
    venueId: values.venueId,
    venueName: values.venueName,
    address: values.address,
    neighborhood: values.neighborhood,
    city: values.city,
    state: values.state,
    postalCode: values.postalCode,
    lat: values.lat,
    lng: values.lng,
  };
  return (
    <LocationPicker
      idPrefix="ev-loc"
      value={loc}
      onChange={(patch) => set(patch)}
      errors={errors}
      venues={venues}
      organizationId={organizationId}
      onVenueSaved={onVenueSaved}
      color={color}
    />
  );
}

const PROVIDERS = ["Sympla", "Eventbrite", "Ingresse", "Shotgun", "Bilheteria Digital", "Ticket360", "Blueticket", "Even3"];

function MoneyInput({ id, value, onChange, errors, name, placeholder }: { id: string; value: string; onChange: (v: string) => void; errors: Errors; name: string; placeholder: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] font-semibold text-muted-foreground">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, "").slice(0, 12))}
        className="pl-12"
        {...aria(errors, name)}
      />
    </div>
  );
}

export function TicketsSection({ values, set, errors }: SectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Entrada</span>
        <Segmented
          label="Tipo de entrada"
          value={values.isFree ? "free" : "paid"}
          onChange={(v) => set({ isFree: v === "free" })}
          options={[
            { value: "free", label: "Gratuita" },
            { value: "paid", label: "Paga", icon: <Ticket /> },
          ]}
          className="self-start"
        />
      </div>
      {!values.isFree && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="A partir de" htmlFor={fid("priceMin")} error={errors.priceMin}>
            <MoneyInput id={fid("priceMin")} name="priceMin" value={values.priceMin} onChange={(v) => set({ priceMin: v })} errors={errors} placeholder="40,00" />
          </Field>
          <Field label="Até" htmlFor={fid("priceMax")} error={errors.priceMax} optional>
            <MoneyInput id={fid("priceMax")} name="priceMax" value={values.priceMax} onChange={(v) => set({ priceMax: v })} errors={errors} placeholder="120,00" />
          </Field>
        </div>
      )}
      <Field
        label={values.isFree ? "Link de inscrição" : "Link de ingressos"}
        htmlFor={fid("ticketUrl")}
        optional
        error={errors.ticketUrl}
        hint="Use o link seguro (https://) da página de venda ou inscrição."
      >
        <Input
          id={fid("ticketUrl")}
          type="url"
          inputMode="url"
          autoComplete="url"
          value={values.ticketUrl}
          placeholder="https://"
          onChange={(e) => set({ ticketUrl: e.target.value.trim() })}
          {...aria(errors, "ticketUrl")}
        />
      </Field>
      <Field label="Plataforma" htmlFor={fid("ticketProvider")} optional error={errors.ticketProvider} hint="Ex.: Sympla, Eventbrite, bilheteria do local.">
        <Input id={fid("ticketProvider")} list="ev-providers" maxLength={60} value={values.ticketProvider} onChange={(e) => set({ ticketProvider: e.target.value })} {...aria(errors, "ticketProvider")} />
        <datalist id="ev-providers">
          {PROVIDERS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
    </div>
  );
}

export function DetailsSection({ values, set, errors }: SectionProps) {
  const [tag, setTag] = useState("");
  const addTag = (raw: string = tag) => {
    const t = normalizeTag(raw);
    if (t.length < 2) return;
    if (values.tags.length >= MAX_TAGS) return;
    if (values.tags.some((x) => x.toLocaleLowerCase("pt-BR") === t.toLocaleLowerCase("pt-BR"))) {
      setTag("");
      return;
    }
    set({ tags: [...values.tags, t] });
    setTag("");
  };
  const toggleAccess = (v: string) =>
    set({ accessibility: values.accessibility.includes(v) ? values.accessibility.filter((x) => x !== v) : [...values.accessibility, v] });

  return (
    <div className="flex flex-col gap-7">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Classificação etária</legend>
        <div role="radiogroup" aria-label="Classificação etária" className="grid grid-cols-6 gap-2">
          {AGE_RATINGS.map((a) => {
            const active = values.ageRating === a.value;
            return (
              <button
                key={a.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={a.label}
                onClick={() => set({ ageRating: a.value })}
                className={cn(
                  "grid h-12 place-items-center rounded-2xl border text-[15px] font-extrabold transition",
                  active ? "border-transparent bg-foreground text-background" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                {a.short}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-muted-foreground">
          {values.ageRating === "LIVRE" ? "Livre para todos os públicos." : `Não recomendado para menores de ${AGE_RATINGS.find((a) => a.value === values.ageRating)?.label}.`}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Accessibility className="size-4 text-primary" /> Acessibilidade e comodidades
        </legend>
        <div className="flex flex-wrap gap-2">
          {ACCESSIBILITY_OPTIONS.map((o) => {
            const active = values.accessibility.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleAccess(o.value)}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition",
                  active ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field
        label="Tags"
        htmlFor={fid("tags")}
        optional
        error={errors.tags}
        hint={`${values.tags.length}/${MAX_TAGS} · Palavras que ajudam a encontrar o evento: samba, ao ar livre, vegano…`}
      >
        <div className="flex gap-2">
          <Input
            id={fid("tags")}
            value={tag}
            maxLength={30}
            disabled={values.tags.length >= MAX_TAGS}
            placeholder={values.tags.length >= MAX_TAGS ? "Limite de tags atingido" : "Digite e aperte Enter"}
            onChange={(e) => {
              const v = e.target.value;
              if (v.endsWith(",")) addTag(v.slice(0, -1));
              else setTag(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            {...aria(errors, "tags")}
          />
          <button
            type="button"
            onClick={() => addTag()}
            disabled={values.tags.length >= MAX_TAGS || normalizeTag(tag).length < 2}
            aria-label="Adicionar tag"
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 text-foreground transition hover:bg-surface-3 disabled:opacity-40"
          >
            <Plus className="size-5" />
          </button>
        </div>
        {values.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1" aria-label="Tags adicionadas">
            {values.tags.map((t) => (
              <li key={t} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface-2 pr-1 pl-3.5 text-sm font-semibold">
                #{t}
                <button
                  type="button"
                  onClick={() => set({ tags: values.tags.filter((x) => x !== t) })}
                  aria-label={`Remover tag ${t}`}
                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>
    </div>
  );
}

export function ImageSection({ values, set, errors, organizationId }: SectionProps & { organizationId: string }) {
  return (
    <div className="flex flex-col gap-3" id={fid("coverUrl")} tabIndex={-1}>
      <ImageUpload
        purpose="event-cover"
        organizationId={organizationId}
        value={values.coverUrl || null}
        aspect="16/9"
        hint="Recomendado 1600 × 900 px (16:9). JPG, PNG ou WebP."
        onChange={(img) => set({ coverUrl: img?.url ?? "", coverThumbUrl: img?.thumbUrl ?? "", coverColor: img?.dominantColor ?? "" })}
      />
      {errors.coverUrl ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {errors.coverUrl}
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">Sem imagem, o evento usa a cor e o ícone da categoria. Evite textos pequenos na arte — no celular a capa aparece reduzida.</p>
      )}
    </div>
  );
}

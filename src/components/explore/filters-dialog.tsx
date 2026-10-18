"use client";

import { Check } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ACCESSIBILITY_OPTIONS, DEFAULT_TIMEZONE } from "@/lib/constants";
import { localDayKey } from "@/lib/dates";
import {
  customWhenRange,
  DEFAULT_SORT,
  DEFAULT_WHEN,
  MAX_RANGE_DAYS,
  SORT_OPTIONS,
  toggleInList,
  type ExploreFilters,
  type ExploreSort,
} from "@/lib/explore-params";
import { cn } from "@/lib/utils";

interface FiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ExploreFilters;
  onApply: (patch: Pick<ExploreFilters, "free" | "access" | "sort">) => void;
  /** Limpa todos os filtros (inclusive categorias, data e busca). */
  onClearAll: () => void;
}

function FiltersForm({ filters, onApply, onClearAll, onClose }: Omit<FiltersDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const id = useId();
  const [free, setFree] = useState(filters.free);
  const [access, setAccess] = useState<string[]>(filters.access);
  const [sort, setSort] = useState<ExploreSort>(filters.sort);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ free, access, sort });
        onClose();
      }}
      className="flex flex-col gap-7"
    >
      <section aria-labelledby={`${id}-price`} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-4">
        <div>
          <h3 id={`${id}-price`} className="text-[15px] font-bold">
            Somente gratuitos
          </h3>
          <p className="text-[13px] text-muted-foreground">Mostrar apenas eventos com entrada grátis.</p>
        </div>
        <Switch checked={free} onCheckedChange={setFree} aria-labelledby={`${id}-price`} />
      </section>

      <section aria-labelledby={`${id}-access`}>
        <h3 id={`${id}-access`} className="text-[15px] font-bold">
          Acessibilidade
        </h3>
        <p className="mb-3 text-[13px] text-muted-foreground">O evento precisa oferecer todos os itens marcados.</p>
        <div className="flex flex-wrap gap-2">
          {ACCESSIBILITY_OPTIONS.map((a) => {
            const on = access.includes(a.value);
            return (
              <Chip key={a.value} size="md" active={on} onClick={() => setAccess((prev) => toggleInList(prev, a.value))} icon={on ? <Check /> : undefined}>
                {a.label}
              </Chip>
            );
          })}
        </div>
      </section>

      <section aria-labelledby={`${id}-sort`}>
        <h3 id={`${id}-sort`} className="mb-3 text-[15px] font-bold">
          Ordenar por
        </h3>
        <div role="radiogroup" aria-labelledby={`${id}-sort`} className="grid gap-2 sm:grid-cols-2">
          {SORT_OPTIONS.map((o) => {
            const on = sort === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSort(o.value)}
                className={cn(
                  "flex min-h-14 items-start gap-3 rounded-2xl border p-3.5 text-left transition",
                  on ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-border-strong",
                )}
              >
                <span
                  aria-hidden
                  className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-primary bg-primary text-white" : "border-border-strong")}
                >
                  {on && <span className="size-2 rounded-full bg-white" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{o.label}</span>
                  <span className="block text-[12px] leading-snug text-muted-foreground">{o.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="sticky -bottom-[max(1.5rem,env(safe-area-inset-bottom))] -mx-6 -mb-[max(1.5rem,env(safe-area-inset-bottom))] flex gap-3 border-t border-border bg-elevated px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setFree(false);
            setAccess([]);
            setSort(DEFAULT_SORT);
            onClearAll();
            onClose();
          }}
        >
          Limpar tudo
        </Button>
        <Button type="submit" variant="primary" className="flex-1">
          Aplicar filtros
        </Button>
      </div>
    </form>
  );
}

/** Filtros adicionais: gratuitos, acessibilidade e ordenação. Abre como sheet no celular e modal no desktop. */
export function FiltersDialog({ open, onOpenChange, ...rest }: FiltersDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Filtros" description="Refine o que aparece no mapa e na lista.">
        {/* remonta a cada abertura para começar dos filtros atuais */}
        {open && <FiltersForm {...rest} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function DateForm({ when, onApply, onClose }: { when: string; onApply: (when: string) => void; onClose: () => void }) {
  const id = useId();
  const [today] = useState(() => localDayKey(new Date(), DEFAULT_TIMEZONE));
  const current = customWhenRange(when);
  const [from, setFrom] = useState(current?.from ?? today);
  const [to, setTo] = useState(current && current.to !== current.from ? current.to : "");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!from) return setError("Escolha o dia.");
        if (from < today) return setError("Escolha uma data a partir de hoje.");
        if (to && to < from) return setError("A data final precisa ser depois da inicial.");
        if (to && to > addDays(from, MAX_RANGE_DAYS)) return setError("Escolha um intervalo de até um ano.");
        onApply(to && to !== from ? `${from}..${to}` : from);
        onClose();
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="De" htmlFor={`${id}-from`}>
          <Input
            id={`${id}-from`}
            type="date"
            min={today}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setError(null);
            }}
            required
            aria-invalid={error ? true : undefined}
          />
        </Field>
        <Field label="Até" htmlFor={`${id}-to`} optional>
          <Input
            id={`${id}-to`}
            type="date"
            min={from || today}
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onApply(DEFAULT_WHEN);
            onClose();
          }}
        >
          Qualquer data
        </Button>
        <Button type="submit" variant="primary" className="flex-1">
          Ver eventos
        </Button>
      </div>
    </form>
  );
}

/** "Escolher data": um dia ou um intervalo, com o seletor nativo do aparelho. */
export function DateDialog({ open, onOpenChange, when, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; when: string; onApply: (when: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Escolher data" description="Veja o que acontece em um dia ou em um período.">
        {open && <DateForm when={when} onApply={onApply} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

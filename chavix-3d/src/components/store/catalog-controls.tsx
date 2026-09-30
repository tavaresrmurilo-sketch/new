"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface FilterOptions {
  categories: Array<{ slug: string; name: string; productCount: number }>;
  colors: Array<{ name: string; hex: string }>;
  fixedCategory?: string;
}

const SORTS: Array<[string, string]> = [
  ["relevancia", "Relevância"],
  ["menor-preco", "Menor preço"],
  ["maior-preco", "Maior preço"],
  ["mais-vendidos", "Mais vendidos"],
  ["recentes", "Mais recentes"],
];

function useParamsUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    if (!("pagina" in changes)) next.delete("pagina");
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, update, pending };
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-line py-5 first:pt-0 last:border-0">
      <legend className="spec mb-3 text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}

function Option({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        checked ? "bg-ink font-medium text-white" : "text-ink-2 hover:bg-sunken hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function FiltersPanel({ options }: { options: FilterOptions }) {
  const { params, update } = useParamsUpdater();
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const category = params.get("categoria");
  const color = params.get("cor");
  const availability = params.get("disponibilidade");

  return (
    <div>
      {!options.fixedCategory && (
        <Group title="Categoria">
          <div role="radiogroup" className="space-y-0.5">
            <Option checked={!category} onClick={() => update({ categoria: null })}>
              Todas
            </Option>
            {options.categories
              .filter((c) => c.productCount > 0)
              .map((c) => (
                <Option key={c.slug} checked={category === c.slug} onClick={() => update({ categoria: c.slug })}>
                  <span>{c.name}</span>
                  <span className="text-xs opacity-60 tabular-nums">{c.productCount}</span>
                </Option>
              ))}
          </div>
        </Group>
      )}

      <Group title="Preço (R$)">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ min: min.trim() || null, max: max.trim() || null });
          }}
        >
          <input
            inputMode="decimal"
            placeholder="Mín."
            aria-label="Preço mínimo"
            value={min}
            onChange={(e) => setMin(e.target.value.replace(/[^\d,.]/g, ""))}
            onBlur={() => update({ min: min.trim() || null })}
            className="h-10 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none"
          />
          <span className="text-faint">–</span>
          <input
            inputMode="decimal"
            placeholder="Máx."
            aria-label="Preço máximo"
            value={max}
            onChange={(e) => setMax(e.target.value.replace(/[^\d,.]/g, ""))}
            onBlur={() => update({ max: max.trim() || null })}
            className="h-10 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none"
          />
          <button type="submit" className="sr-only">
            Aplicar preço
          </button>
        </form>
      </Group>

      {options.colors.length > 0 && (
        <Group title="Cor">
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {options.colors.map((c) => {
              const active = color?.toLowerCase() === c.name.toLowerCase();
              return (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={c.name}
                  onClick={() => update({ cor: active ? null : c.name })}
                  className={cn(
                    "h-8 w-8 rounded-full ring-1 ring-black/10 transition-shadow",
                    active && "ring-2 ring-accent ring-offset-2 ring-offset-canvas",
                  )}
                  style={{ background: c.hex }}
                >
                  <span className="sr-only">{c.name}</span>
                </button>
              );
            })}
          </div>
        </Group>
      )}

      <Group title="Disponibilidade">
        <div role="radiogroup" className="space-y-0.5">
          <Option checked={!availability} onClick={() => update({ disponibilidade: null })}>
            Todas
          </Option>
          <Option checked={availability === "pronta-entrega"} onClick={() => update({ disponibilidade: "pronta-entrega" })}>
            Pronta entrega
          </Option>
          <Option checked={availability === "sob-encomenda"} onClick={() => update({ disponibilidade: "sob-encomenda" })}>
            Sob encomenda
          </Option>
        </div>
      </Group>

      <Group title="Destaques">
        <div className="space-y-2">
          {[
            ["lancamentos", "Lançamentos"],
            ["mais-vendidos", "Mais vendidos"],
          ].map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-2 text-sm text-ink-2">
              {label}
              <input
                type="checkbox"
                checked={params.get(key) === "1"}
                onChange={(e) => update({ [key]: e.target.checked ? "1" : null })}
                className="h-4.5 w-4.5 accent-[var(--color-accent)]"
              />
            </label>
          ))}
        </div>
      </Group>
    </div>
  );
}

export function SortSelect() {
  const { params, update } = useParamsUpdater();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-muted sm:inline">Ordenar por</span>
      <select
        value={params.get("ordem") ?? "relevancia"}
        onChange={(e) => update({ ordem: e.target.value === "relevancia" ? null : e.target.value })}
        className="h-10 rounded-md border border-line-strong bg-surface pr-8 pl-3 text-sm focus:border-accent focus:outline-none"
        aria-label="Ordenar por"
      >
        {SORTS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MobileFilters({ options, activeCount }: { options: FilterOptions; activeCount: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="md" onClick={() => setOpen(true)} className="lg:hidden">
        <SlidersHorizontal className="h-4 w-4" />
        Filtrar
        {activeCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.7rem] text-white">{activeCount}</span>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} side="bottom" title="Filtrar chaveiros" footer={<Button className="w-full" onClick={() => setOpen(false)}>Ver resultados</Button>}>
        <div className="py-5">
          <FiltersPanel options={options} />
        </div>
      </Sheet>
    </>
  );
}

const LABELS: Record<string, (v: string, o: FilterOptions) => string> = {
  q: (v) => `“${v}”`,
  categoria: (v, o) => o.categories.find((c) => c.slug === v)?.name ?? v,
  cor: (v) => v,
  min: (v) => `A partir de R$ ${v}`,
  max: (v) => `Até R$ ${v}`,
  disponibilidade: (v) => (v === "pronta-entrega" ? "Pronta entrega" : "Sob encomenda"),
  lancamentos: () => "Lançamentos",
  "mais-vendidos": () => "Mais vendidos",
};

export function ActiveFilters({ options }: { options: FilterOptions }) {
  const { params, update } = useParamsUpdater();
  const active = Object.keys(LABELS).filter((key) => params.get(key) && !(key === "categoria" && options.fixedCategory));
  if (active.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {active.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => update({ [key]: null })}
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface py-1 pr-2 pl-3 text-sm text-ink-2 hover:border-ink/40"
        >
          {LABELS[key](params.get(key)!, options)}
          <X className="h-3.5 w-3.5" aria-label="Remover filtro" />
        </button>
      ))}
      <button type="button" onClick={() => update(Object.fromEntries(active.map((k) => [k, null])))} className="text-sm text-muted underline-offset-4 hover:underline">
        Limpar tudo
      </button>
    </div>
  );
}

"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { fieldBase, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type FilterField =
  | { type: "search"; name: string; label: string; placeholder?: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }
  | { type: "date"; name: string; label: string };

/**
 * Filtros persistidos na URL (compartilháveis e com voltar/avançar do navegador).
 * Funciona como formulário GET comum mesmo antes do JavaScript carregar.
 */
export function FilterBar({ fields, className }: { fields: FilterField[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const searchField = fields.find((f) => f.type === "search");
  const [q, setQ] = useState(searchField ? sp.get(searchField.name) ?? "" : "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("pagina");
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onSearch = (value: string) => {
    setQ(value);
    if (!searchField) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ [searchField.name]: value.trim() }), 400);
  };

  const active = fields.some((f) => sp.get(f.name));
  const others = fields.filter((f) => f.type !== "search");

  return (
    <form
      role="search"
      method="get"
      action={pathname}
      aria-busy={pending || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (searchField) apply({ [searchField.name]: q.trim() });
      }}
      className={cn("mb-4 flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center", pending && "opacity-80", className)}
    >
      {searchField && (
        <div className="relative min-w-0 flex-1 lg:min-w-72">
          <label htmlFor={`f-${searchField.name}`} className="sr-only">
            {searchField.label}
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" />
          <input
            id={`f-${searchField.name}`}
            name={searchField.name}
            type="search"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={searchField.placeholder ?? searchField.label}
            autoComplete="off"
            className={cn(fieldBase, "h-11 pl-11")}
          />
        </div>
      )}
      {others.length > 0 && (
        <div className={cn("grid gap-2.5 sm:flex sm:flex-wrap", others.length > 1 ? "grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2" : "grid-cols-1")}>
          {others.map((f) =>
            f.type === "select" ? (
              <div key={f.name} className="min-w-0 sm:w-48">
                <label htmlFor={`f-${f.name}`} className="sr-only">
                  {f.label}
                </label>
                <Select id={`f-${f.name}`} name={f.name} value={sp.get(f.name) ?? ""} onChange={(e) => apply({ [f.name]: e.target.value })} className="h-11 text-sm">
                  <option value="">{f.allLabel ?? f.label}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : f.type === "date" ? (
              <div key={f.name} className="flex min-w-0 items-center gap-2 sm:w-52">
                <label htmlFor={`f-${f.name}`} className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {f.label}
                </label>
                <input
                  id={`f-${f.name}`}
                  name={f.name}
                  type="date"
                  value={sp.get(f.name) ?? ""}
                  onChange={(e) => apply({ [f.name]: e.target.value })}
                  className={cn(fieldBase, "h-11 min-w-0 px-3 text-sm")}
                />
              </div>
            ) : null,
          )}
        </div>
      )}
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="md"
          className="self-start lg:self-auto"
          onClick={() => {
            setQ("");
            apply(Object.fromEntries(fields.map((f) => [f.name, ""])));
          }}
        >
          <X /> Limpar filtros
        </Button>
      )}
    </form>
  );
}

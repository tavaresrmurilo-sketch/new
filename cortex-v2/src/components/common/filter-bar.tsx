"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = React.useTransition();
  const set = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      const s = next.toString();
      start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );
  return { params, set, pending };
}

export function SearchInput({ placeholder = "Buscar…", className, paramKey = "q" }: { placeholder?: string; className?: string; paramKey?: string }) {
  const { params, set, pending } = useUrlParams();
  const [value, setValue] = React.useState(params.get(paramKey) ?? "");
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => set({ [paramKey]: value.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("h-8 pl-8 text-[13px]", pending && "opacity-80")}
        type="search"
      />
    </div>
  );
}

/** Barra de filtros sincronizada com a URL (compartilhável e compatível com Saved Views). */
export function FilterBar({ filters, searchPlaceholder, children, className }: { filters?: FilterDef[]; searchPlaceholder?: string; children?: React.ReactNode; className?: string }) {
  const { params, set } = useUrlParams();
  const active = (filters ?? []).filter((f) => params.get(f.key));
  return (
    <div className={cn("flex flex-col gap-2 pb-3 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      <SearchInput placeholder={searchPlaceholder} />
      {(filters ?? []).map((f) => (
        <NativeSelect
          key={f.key}
          aria-label={f.label}
          value={params.get(f.key) ?? ""}
          onChange={(e) => set({ [f.key]: e.target.value || null })}
          className={cn("h-8 w-full text-[13px] sm:w-auto sm:min-w-[140px]", params.get(f.key) && "border-primary/40 bg-primary/5")}
        >
          <option value="">{f.label}: todos</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      ))}
      {active.length ? (
        <Button variant="ghost" size="sm" onClick={() => set(Object.fromEntries(active.map((f) => [f.key, null])))}>
          <X /> Limpar filtros
        </Button>
      ) : null}
      {children ? <div className="flex items-center gap-2 sm:ml-auto">{children}</div> : null}
    </div>
  );
}

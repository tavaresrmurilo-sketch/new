"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Filtro de período: escopo de todos os indicadores e gráficos abaixo dele. */
export function PeriodFilter({ value, param = "periodo" }: { value: PeriodKey; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function select(key: PeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(param, key);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div
      role="radiogroup"
      aria-label="Período"
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-xl border bg-card p-1 shadow-xs transition-opacity",
        pending && "opacity-60",
      )}
    >
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          onClick={() => select(option.key)}
          className={cn(
            "shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
            value === option.key && "bg-primary text-primary-foreground shadow-sm hover:text-primary-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

import Link from "next/link";
import { PERIOD_LABELS, type PeriodKey } from "@/lib/dates";
import { buildHref, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

const KEYS: PeriodKey[] = ["today", "week", "month", "quarter", "year"];

/** Seletor de período baseado em URL (?period=), com intervalo personalizado via formulário GET. */
export function PeriodSelect({ pathname, searchParams, active, from, to }: { pathname: string; searchParams: SearchParams; active: PeriodKey; from?: string; to?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Período">
        {KEYS.map((k) => (
          <Link
            key={k}
            href={buildHref(pathname, { ...searchParams, from: undefined, to: undefined }, { period: k === "month" ? null : k })}
            scroll={false}
            aria-current={active === k ? "true" : undefined}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
              active === k && "bg-secondary text-foreground shadow-sm",
            )}
          >
            {PERIOD_LABELS[k]}
          </Link>
        ))}
      </div>
      <form action={pathname} method="get" className="flex items-center gap-1 text-xs">
        <input type="hidden" name="period" value="custom" />
        {Object.entries(searchParams)
          .filter(([k, v]) => !["period", "from", "to", "page"].includes(k) && typeof v === "string")
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v as string} />
          ))}
        <label className="sr-only" htmlFor="period-from">De</label>
        <input id="period-from" name="from" type="date" defaultValue={from} required className="h-7 rounded-md border bg-card px-1.5 text-xs" />
        <span className="text-muted-foreground">até</span>
        <label className="sr-only" htmlFor="period-to">Até</label>
        <input id="period-to" name="to" type="date" defaultValue={to} required className="h-7 rounded-md border bg-card px-1.5 text-xs" />
        <button type="submit" className={cn("h-7 rounded-md border px-2 font-medium hover:bg-accent", active === "custom" && "bg-secondary")}>
          Aplicar
        </button>
      </form>
    </div>
  );
}

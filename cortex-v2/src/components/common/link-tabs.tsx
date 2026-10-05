import Link from "next/link";
import { buildHref, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

/** Abas baseadas em URL (?tab=), renderizadas no servidor — permitem links diretos para cada seção. */
export function LinkTabs({ pathname, searchParams, active, tabs }: { pathname: string; searchParams: SearchParams; active: string; tabs: { key: string; label: string; count?: number | null }[] }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b scrollbar-thin" aria-label="Seções">
      {tabs.map((t, i) => (
        <Link
          key={t.key}
          href={buildHref(pathname, { ...searchParams, page: undefined }, { tab: i === 0 ? null : t.key })}
          scroll={false}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "-mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground",
            active === t.key && "border-foreground text-foreground",
          )}
        >
          {t.label}
          {t.count ? <span className="tabular rounded-full bg-muted px-1.5 text-[11px]">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

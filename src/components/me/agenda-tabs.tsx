import Link from "next/link";
import { cn } from "@/lib/utils";

export interface AgendaTabLink {
  value: string;
  label: string;
  count?: number;
}

/** Abas da agenda como links (cada aba é uma URL compartilhável e carrega só os seus dados). */
export function AgendaTabs({ tabs, active }: { tabs: AgendaTabLink[]; active: string }) {
  return (
    <nav aria-label="Seções da agenda">
      <ul className="grid grid-cols-4 gap-1 rounded-full bg-surface-2 p-1">
        {tabs.map((t) => {
          const current = t.value === active;
          return (
            <li key={t.value} className="min-w-0">
              <Link
                href={t.value === "vou" ? "/salvos" : `/salvos?aba=${t.value}`}
                aria-current={current ? "page" : undefined}
                scroll={false}
                className={cn(
                  "flex h-11 items-center justify-center gap-1 rounded-full px-1.5 text-[13px] font-semibold whitespace-nowrap transition sm:gap-1.5 sm:px-4 sm:text-sm",
                  current ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.count ? (
                  <span
                    className={cn(
                      "min-w-[18px] rounded-full px-1 text-center text-[10px] leading-[18px] font-bold sm:min-w-5 sm:px-1.5 sm:text-[11px] sm:leading-5",
                      current ? "bg-primary-soft text-primary" : "bg-surface-3 text-muted-foreground",
                    )}
                  >
                    {t.count > 99 ? "99+" : t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

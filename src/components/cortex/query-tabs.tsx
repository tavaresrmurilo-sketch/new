"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Seletor segmentado que grava a escolha em um parâmetro da URL. */
export function QueryTabs({ param, options, value }: { param: string; options: { value: string; label: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="inline-flex h-8 items-center gap-0.5 rounded-lg bg-muted p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.set(param, o.value);
            router.push(`${pathname}?${next.toString()}`);
          }}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", o.value === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

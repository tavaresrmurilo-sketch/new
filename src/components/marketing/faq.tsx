import { ChevronDown } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

/** Perguntas frequentes com <details>/<summary> (acessível por teclado e leitores de tela, sem JS). */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface">
      {items.map((it) => (
        <details key={it.q} className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold transition hover:bg-surface-2/60 focus-visible:bg-surface-2 focus-visible:outline-none sm:px-6 [&::-webkit-details-marker]:hidden">
            <span>{it.q}</span>
            <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="px-5 pb-5 text-[15px] leading-relaxed text-muted-foreground sm:px-6">{it.a}</p>
        </details>
      ))}
    </div>
  );
}

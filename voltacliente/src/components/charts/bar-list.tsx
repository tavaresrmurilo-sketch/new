import { cn } from "@/lib/utils";

/**
 * Ranking em barras horizontais (série única, uma cor). Feito em HTML para
 * rótulos longos de serviços quebrarem bem no celular.
 */
export function BarList({
  items,
  format,
  className,
}: {
  items: { key: string; label: string; value: number; detail?: string }[];
  format: (value: number) => string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              <span className="font-semibold text-foreground">{format(item.value)}</span>
              {item.detail && <span className="ml-1.5 text-xs">{item.detail}</span>}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted" aria-hidden>
            <div className="h-2 rounded-full bg-chart-2" style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

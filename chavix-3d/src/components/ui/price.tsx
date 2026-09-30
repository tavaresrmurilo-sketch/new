import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";

export function Price({
  cents,
  compareAtCents,
  from,
  size = "md",
  className,
}: {
  cents: number;
  compareAtCents?: number | null;
  from?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const onSale = compareAtCents != null && compareAtCents > cents;
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-3xl" };
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      {from && <span className="text-xs text-muted">a partir de</span>}
      <span className={cn("font-semibold tracking-tight text-ink", sizes[size])}>{formatBRL(cents)}</span>
      {onSale && (
        <span className="text-sm text-faint line-through decoration-faint/70">
          <span className="sr-only">de </span>
          {formatBRL(compareAtCents)}
        </span>
      )}
    </span>
  );
}

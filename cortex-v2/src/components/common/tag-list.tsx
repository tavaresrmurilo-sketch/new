import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
};

export function TagList({ tags, max = 3, className }: { tags: { name: string; color?: string }[]; max?: number; className?: string }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((t) => (
        <span key={t.name} className={cn("rounded px-1.5 py-px text-[11px] font-medium", COLORS[t.color ?? "slate"] ?? COLORS.slate)}>
          {t.name}
        </span>
      ))}
      {tags.length > max ? <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span> : null}
    </span>
  );
}

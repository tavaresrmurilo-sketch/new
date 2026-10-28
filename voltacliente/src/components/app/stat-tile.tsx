import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  default: "bg-accent text-primary",
  emerald: "bg-emerald-soft text-emerald-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-destructive-soft text-destructive-soft-foreground",
} as const;

export function StatTile({
  label,
  value,
  caption,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  caption?: React.ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-2 font-sans text-[1.75rem] leading-none font-semibold tracking-tight">{value}</p>
      {caption && <p className="mt-2 text-xs text-muted-foreground">{caption}</p>}
      {href && (
        <ArrowUpRightIcon className="absolute right-3 bottom-3 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </>
  );
  const className = "group relative block rounded-xl border bg-card p-4 shadow-xs transition-all sm:p-5";
  return href ? (
    <Link href={href} className={cn(className, "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

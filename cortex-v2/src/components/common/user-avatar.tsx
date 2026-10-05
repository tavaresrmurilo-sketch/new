import * as React from "react";
import { cn, initials } from "@/lib/utils";

const PALETTE = [
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function UserAvatar({ name, src, size = "md", className }: { name: string | null | undefined; src?: string | null; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const dim = { xs: "size-5 text-[9px]", sm: "size-6 text-[10px]", md: "size-8 text-xs", lg: "size-10 text-sm" }[size];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? ""} className={cn("shrink-0 rounded-full object-cover", dim, className)} />;
  }
  return (
    <span
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold", dim, colorFor(name ?? "?"), className)}
      aria-label={name ?? undefined}
      title={name ?? undefined}
    >
      {initials(name)}
    </span>
  );
}

export function UserChip({ name, className }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <UserAvatar name={name} size="xs" />
      <span className="truncate">{name}</span>
    </span>
  );
}

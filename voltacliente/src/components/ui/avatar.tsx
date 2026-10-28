import { cn, initials } from "@/lib/utils";

const TONES = [
  "bg-info-soft text-info-soft-foreground",
  "bg-emerald-soft text-emerald-soft-foreground",
  "bg-warning-soft text-warning-soft-foreground",
  "bg-secondary text-secondary-foreground",
];

function toneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", toneFor(name), className)}
    >
      {initials(name)}
    </span>
  );
}

export { Avatar };

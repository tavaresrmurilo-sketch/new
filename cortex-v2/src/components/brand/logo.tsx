import { cn } from "@/lib/utils";

/** Marca JR Córtex: núcleo + conexões (dados → decisões). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-foreground" />
      <circle cx="16" cy="16" r="4.2" className="fill-background" />
      <circle cx="8.5" cy="10" r="2" className="fill-background" opacity="0.7" />
      <circle cx="23.5" cy="10" r="2" className="fill-background" opacity="0.7" />
      <circle cx="16" cy="25" r="2" className="fill-background" opacity="0.7" />
      <path d="M10 11.2 13 14M22 11.2 19 14M16 20.2V23" className="stroke-background" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {!compact ? (
        <span className="text-[15px] font-semibold tracking-tight">
          JR <span className="text-muted-foreground">Córtex</span>
        </span>
      ) : null}
    </span>
  );
}

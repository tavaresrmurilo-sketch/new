import { cn } from "@/lib/utils";

export function Logo({ className, compact = false, inverted = false }: { className?: string; compact?: boolean; inverted?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={inverted ? "#ffffff" : "hsl(var(--brand))"} fillOpacity={inverted ? 0.08 : 1} />
        <path d="M9 21.5c0-4.8 3.1-8.5 7.3-8.5 2.2 0 3.9.8 5.2 2.3" stroke="hsl(var(--brand-gold))" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <circle cx="16.3" cy="21" r="2.1" fill="hsl(var(--brand-gold))" />
        <path d="M13 10.5h8.5" stroke={inverted ? "#cfd8e6" : "#ffffff"} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      {!compact ? (
        <div className="leading-tight">
          <p className={cn("text-sm font-semibold tracking-tight", inverted ? "text-white" : "text-foreground")}>JR Cortex AI</p>
          <p className={cn("text-[10px] uppercase tracking-[0.12em]", inverted ? "text-sidebar-muted" : "text-muted-foreground")}>JR Consultorias</p>
        </div>
      ) : null}
    </div>
  );
}

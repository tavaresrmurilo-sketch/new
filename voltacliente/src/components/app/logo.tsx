import Link from "next/link";
import { cn } from "@/lib/utils";

/** Marca: seta de retorno formando um "V" — cliente que volta. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      {/* Cor sólida (sem gradiente com id): o logo aparece várias vezes na página. */}
      <rect width="32" height="32" rx="9" fill="oklch(0.4 0.15 262)" />
      <path d="M8.5 10.5 15 22l6.5-11.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19.2 8.6h4.6v4.6"
        fill="none"
        stroke="oklch(0.78 0.15 163)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, href = "/", inverted = false }: { className?: string; href?: string; inverted?: boolean }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <LogoMark />
      <span className={cn("font-display text-lg font-bold tracking-tight", inverted ? "text-white" : "text-foreground")}>
        Volta<span className="text-emerald">Cliente</span>
      </span>
    </Link>
  );
}

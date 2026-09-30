import { cn } from "@/lib/cn";

// Mesma geometria de scripts/generate-brand.ts (viewBox 40×40).
const CX = 15.5;
const CY = 20;
const R = 10.25;
const A = (46 * Math.PI) / 180;
const START = `${(CX + R * Math.cos(-A)).toFixed(2)} ${(CY + R * Math.sin(-A)).toFixed(2)}`;
const END = `${(CX + R * Math.cos(A)).toFixed(2)} ${(CY + R * Math.sin(A)).toFixed(2)}`;
const BANDS = Array.from({ length: 8 }, (_, i) => 4 + i * 4.3);

/** Símbolo: a letra C em camadas de impressão, atravessada por uma chave. */
export function LogoMark({ id, className, layered = true }: { id: string; className?: string; layered?: boolean }) {
  const maskId = `chx-layers-${id}`;
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={cn("shrink-0", className)}>
      {layered && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">
            {BANDS.map((y) => (
              <rect key={y} x="0" y={y} width="40" height="3.35" fill="#fff" />
            ))}
          </mask>
        </defs>
      )}
      <g mask={layered ? `url(#${maskId})` : undefined} fill="currentColor">
        <path d={`M${START} A${R} ${R} 0 1 0 ${END}`} fill="none" stroke="currentColor" strokeWidth="7.2" />
        <path d="M15.5 16.9 H36.9 a1.675 1.675 0 0 1 0 3.35 H15.5 Z" />
        <rect x="27.6" y="20" width="3.2" height="4.55" />
        <rect x="32.8" y="20" width="3.2" height="3.4" />
      </g>
    </svg>
  );
}

export function Logo({ id, tone = "dark", className }: { id: string; tone?: "dark" | "light"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark id={id} className={cn("h-8 w-8", tone === "dark" ? "text-accent" : "text-accent-bright")} />
      <span className={cn("flex items-center gap-1.5 font-sans text-[1.2rem] font-bold tracking-[-0.03em]", tone === "dark" ? "text-ink" : "text-white")}>
        CHAVIX
        <span
          className={cn(
            "rounded-[4px] border-[1.5px] px-1 py-px font-mono text-[0.62rem] leading-none font-semibold tracking-normal",
            tone === "dark" ? "border-ink" : "border-white",
          )}
        >
          3D
        </span>
      </span>
      <span className="sr-only">CHAVIX 3D</span>
    </span>
  );
}

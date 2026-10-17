import { useId } from "react";
import { cn } from "@/lib/utils";

/** Símbolo do Mixtour: pino de mapa + equalizador (mix de experiências no mapa). */
export function LogoMark({ className, title = "Mixtour" }: { className?: string; title?: string }) {
  // id único por instância: com dois logos na página (um oculto), url(#id) apontaria para o oculto.
  const gid = `mx-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={cn("size-8", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id={gid} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset="0.45" stopColor="#B04DFF" />
          <stop offset="0.75" stopColor="#FF4D8D" />
          <stop offset="1" stopColor="#FF8A3D" />
        </linearGradient>
      </defs>
      <path d="M24 3C14.6 3 7 10.4 7 19.6c0 11.4 13.6 23.3 15.6 25a2.2 2.2 0 0 0 2.8 0C27.4 42.9 41 31 41 19.6 41 10.4 33.4 3 24 3Z" fill={`url(#${gid})`} />
      <g fill="#fff">
        <rect x="15.5" y="16" width="3.2" height="7" rx="1.6" />
        <rect x="20.1" y="13" width="3.2" height="13" rx="1.6" />
        <rect x="24.7" y="14.5" width="3.2" height="10" rx="1.6" />
        <rect x="29.3" y="17" width="3.2" height="5" rx="1.6" />
      </g>
    </svg>
  );
}

export function Logo({ className, markClassName, compact }: { className?: string; markClassName?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      {!compact && (
        <span className="font-display text-[22px] leading-none font-extrabold tracking-[-0.04em]">
          mix<span className="text-brand-gradient">tour</span>
        </span>
      )}
    </span>
  );
}

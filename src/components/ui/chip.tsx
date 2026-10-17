"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  color?: string;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}

/** Filtro em pílula (categorias, datas). Usa aria-pressed para leitores de tela. */
export const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { active, color, icon, size = "md", className, children, style, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap transition-all active:scale-95 [&_svg]:size-4",
        size === "md" ? "h-10 px-4 text-sm" : "h-8 px-3 text-[13px]",
        active
          ? "border-transparent text-white shadow-[0_6px_18px_-8px_var(--chip-color)]"
          : "glass border-border text-foreground hover:border-border-strong",
        className,
      )}
      style={{
        ...(active ? { background: color ?? "var(--primary)" } : {}),
        ["--chip-color" as string]: color ?? "var(--primary)",
        ...style,
      }}
      {...props}
    >
      {icon && <span className={cn(!active && color ? "" : "")} style={!active && color ? { color } : undefined}>{icon}</span>}
      {children}
    </button>
  );
});

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  className?: string;
  label?: string;
}

export function Segmented<T extends string>({ value, onChange, options, className, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition [&_svg]:size-4",
            value === o.value ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

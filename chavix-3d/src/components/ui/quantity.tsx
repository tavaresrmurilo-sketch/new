"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export function QuantityStepper({
  value,
  min = 1,
  max = 999,
  onChange,
  disabled,
  size = "md",
  label = "Quantidade",
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
}) {
  const h = size === "sm" ? "h-9" : "h-11";
  const w = size === "sm" ? "w-8" : "w-10";
  return (
    <div className={cn("inline-flex items-stretch rounded-md border border-line-strong bg-surface", h)} role="group" aria-label={label}>
      <button
        type="button"
        className={cn(w, "grid place-items-center text-ink-2 transition-colors hover:text-ink disabled:opacity-35")}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Diminuir quantidade"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="w-10 border-x border-line bg-transparent text-center text-sm font-medium tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
        }}
      />
      <button
        type="button"
        className={cn(w, "grid place-items-center text-ink-2 transition-colors hover:text-ink disabled:opacity-35")}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Aumentar quantidade"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

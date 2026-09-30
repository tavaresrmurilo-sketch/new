"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { inputClass } from "@/components/ui/field";

export function MoneyInput({ value, onChange, className, ...props }: Omit<ComponentProps<"input">, "value" | "onChange"> & { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">R$</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ""))}
        className={cn(inputClass, "h-11 pl-9 tabular-nums", className)}
        {...props}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: ReactNode; description?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-line-strong")}
      >
        <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
    </label>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-6 border-b border-line py-8 first:pt-0 last:border-0 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "dark" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  dark: "bg-ink text-white",
  outline: "border border-line-strong text-ink-2 bg-surface",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[0.7rem] font-semibold leading-4", tones[tone], className)}>
      {children}
    </span>
  );
}

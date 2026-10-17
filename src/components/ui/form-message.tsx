"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";

export function FormMessage({ state, className }: { state: ActionState<unknown>; className?: string }) {
  if (state.status === "idle") return null;
  if (state.status === "success" && !state.message) return null;
  const ok = state.status === "success";
  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium",
        ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
        className,
      )}
    >
      {ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
      <span>{state.message}</span>
    </div>
  );
}

export function fieldError(state: ActionState<unknown>, name: string): string | undefined {
  return state.status === "error" ? state.fieldErrors?.[name] : undefined;
}

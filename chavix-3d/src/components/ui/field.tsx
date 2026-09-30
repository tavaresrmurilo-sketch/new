import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full rounded-md border border-line-strong bg-surface px-3.5 text-[0.95rem] text-ink placeholder:text-faint transition-colors hover:border-ink/30 focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15 disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/10";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select className={cn(inputClass, "h-11 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <svg viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true">
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-faint">opcional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[0.8rem] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8rem] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm text-ink-2", className)}>
      <input type="checkbox" className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-[var(--color-accent)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="spec text-accent">{eyebrow}</p>}
        <h2 className="mt-2 text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] sm:text-4xl">{title}</h2>
        {description && <p className="mt-3 text-[0.98rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {action && (
        <Link href={action.href} className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-ink hover:text-accent">
          {action.label}
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      )}
    </div>
  );
}

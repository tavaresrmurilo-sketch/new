import { cn } from "@/lib/utils";

/**
 * Estado vazio ilustrado da área do explorador: composição com o gradiente da
 * marca (cartões sobrepostos + ícone), título, explicação e chamada para ação.
 */
export function IllustratedEmpty({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <div aria-hidden className="relative mb-7 h-28 w-48">
        <div className="absolute inset-x-6 -inset-y-3 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--primary)_28%,transparent),transparent)] blur-xl" />
        <div className="absolute top-5 left-1 flex h-20 w-[72px] -rotate-[14deg] flex-col gap-1.5 rounded-2xl border border-border-strong bg-surface p-2.5 shadow-card">
          <span className="h-6 rounded-lg bg-surface-3" />
          <span className="h-1.5 w-4/5 rounded-full bg-surface-3" />
          <span className="h-1.5 w-1/2 rounded-full bg-surface-3" />
        </div>
        <div className="absolute top-3 right-1 flex h-20 w-[72px] rotate-[12deg] flex-col gap-1.5 rounded-2xl border border-border-strong bg-surface p-2.5 shadow-card">
          <span className="h-6 rounded-lg bg-surface-3" />
          <span className="h-1.5 w-4/5 rounded-full bg-surface-3" />
          <span className="h-1.5 w-1/2 rounded-full bg-surface-3" />
        </div>
        <div className="bg-brand-gradient absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[26px] text-white shadow-float ring-4 ring-background [&_svg]:size-9">
          {icon}
        </div>
        <span className="absolute -top-1 right-9 size-2.5 rounded-full bg-brand-orange" />
        <span className="absolute bottom-0 left-10 size-2 rounded-full bg-brand-pink" />
      </div>
      <h2 className="text-xl font-extrabold tracking-tight text-balance">{title}</h2>
      {description && <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-pretty text-muted-foreground">{description}</p>}
      {action && <div className="mt-7 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

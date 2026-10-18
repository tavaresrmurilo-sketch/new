import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/misc";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Tone } from "./labels";

/** Container padrão das páginas do /admin. */
export function AdminPage({
  title,
  description,
  actions,
  eyebrow,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("mx-auto w-full max-w-7xl px-4 pt-5 pb-16 sm:px-6 lg:px-10 lg:pt-9", className)}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:mb-8">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-sm font-semibold text-primary">{eyebrow}</div>}
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </main>
  );
}

export function StatusBadge({ map, value, className }: { map: Record<string, { label: string; tone: Tone }>; value: string; className?: string }) {
  const s = map[value] ?? { label: value, tone: "neutral" as Tone };
  return (
    <Badge tone={s.tone} className={className}>
      {s.label}
    </Badge>
  );
}

/** Painel com título (seções das páginas do /admin). */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-3xl border border-border bg-surface shadow-card", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold tracking-tight sm:text-lg">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn("p-5 sm:p-6", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Lista que vira tabela no desktop: o cabeçalho só aparece a partir de lg. */
export function DataList({ columns, head, children, className }: { columns: string; head: React.ReactNode[]; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-3xl border border-border bg-surface shadow-card", className)}>
      <div
        role="row"
        className="hidden gap-4 border-b border-border bg-surface-2/60 px-5 py-3 text-xs font-bold tracking-wide text-muted-foreground uppercase lg:grid"
        style={{ gridTemplateColumns: columns }}
      >
        {head.map((h, i) => (
          <span key={i} role="columnheader" className="min-w-0 truncate">
            {h}
          </span>
        ))}
      </div>
      <ul role="list" className="divide-y divide-border">
        {children}
      </ul>
    </div>
  );
}

export function DataRow({ columns, children, className }: { columns: string; children: React.ReactNode; className?: string }) {
  return (
    <li className={cn("flex flex-col gap-2.5 px-4 py-4 sm:px-5 lg:grid lg:grid-cols-(--cols) lg:items-center lg:gap-4 lg:py-3.5", className)} style={{ ["--cols" as string]: columns }}>
      {children}
    </li>
  );
}

/** Rótulo visível só no celular (onde a linha vira cartão). */
export function MobileLabel({ children }: { children: React.ReactNode }) {
  return <span className="mr-1.5 text-xs font-semibold text-subtle-foreground lg:hidden">{children}</span>;
}

/** Monta o href preservando os filtros atuais. */
export function hrefWith(basePath: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function Pagination({
  basePath,
  params,
  page,
  pageCount,
  total,
  pageSize,
  noun = "itens",
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  noun?: string;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number) => hrefWith(basePath, params, { pagina: p > 1 ? String(p) : undefined });
  const btn = "inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold transition";
  return (
    <nav aria-label="Paginação" className="mt-5 flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">
          {formatNumber(from)}–{formatNumber(to)}
        </span>{" "}
        de <span className="tabular-nums">{formatNumber(total)}</span> {noun}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={link(page - 1)} className={cn(btn, "hover:bg-surface-2")} aria-label="Página anterior">
            <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Anterior</span>
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-40")} aria-hidden>
            <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Anterior</span>
          </span>
        )}
        <span className="hidden text-sm text-muted-foreground tabular-nums sm:inline">
          {page} / {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={link(page + 1)} className={cn(btn, "hover:bg-surface-2")} aria-label="Próxima página">
            <span className="hidden sm:inline">Próxima</span> <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={cn(btn, "pointer-events-none opacity-40")} aria-hidden>
            <span className="hidden sm:inline">Próxima</span> <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}

/** Abas de status como links (filtro persistido na URL). */
export function LinkTabs({
  basePath,
  params,
  name,
  value,
  options,
  label,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  name: string;
  value: string | undefined;
  options: { value: string | undefined; label: string; count?: number }[];
  label: string;
}) {
  return (
    <nav aria-label={label} className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {options.map((o) => {
        const active = (o.value ?? "") === (value ?? "");
        return (
          <Link
            key={o.value ?? "__default"}
            href={hrefWith(basePath, params, { [name]: o.value, pagina: undefined })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
              active ? "border-transparent bg-foreground text-background" : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-background/20" : "bg-surface-2 text-foreground")}>{formatNumber(o.count)}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Par rótulo/valor (fichas de detalhes). */
export function Meta({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-semibold text-subtle-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

/** KPI compacto do /admin. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="pt-1 text-[13px] leading-tight font-semibold text-muted-foreground">{label}</span>
        {icon && <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground [&_svg]:size-4">{icon}</span>}
      </div>
      <span className="mt-auto text-[26px] leading-none font-extrabold tracking-tight tabular-nums sm:text-[28px]">{value}</span>
      {hint && <span className="text-xs leading-snug font-medium text-subtle-foreground">{hint}</span>}
    </>
  );
  const cls = cn("flex min-h-32 min-w-0 flex-col gap-2 rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5", className);
  return href ? (
    <Link href={href} className={cn(cls, "transition hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

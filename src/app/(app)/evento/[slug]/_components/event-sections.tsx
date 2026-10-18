import { ArrowRight, CircleAlert, Clock3, Eye, History, Radio } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/events/category-icon";
import { EventCard } from "@/components/events/event-card";
import { Button } from "@/components/ui/button";
import type { EventCardData } from "@/lib/events";
import { cn } from "@/lib/utils";

/** Capa 4:3 no celular (16:9 no desktop). Sem imagem: gradiente da cor da categoria + ícone. */
export function EventCover({
  title,
  coverUrl,
  coverThumbUrl,
  coverColor,
  category,
  children,
}: {
  title: string;
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverColor: string | null;
  category: { icon: string; color: string; name: string };
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2 sm:aspect-[16/9] lg:rounded-3xl lg:border lg:border-border"
      style={{ backgroundColor: coverColor ?? undefined }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          srcSet={coverThumbUrl ? `${coverThumbUrl} 720w, ${coverUrl} 1600w` : undefined}
          sizes="(min-width: 1024px) 760px, 100vw"
          alt={`Capa do evento ${title}`}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={`Evento de ${category.name}`}
          className="absolute inset-0 grid place-items-center overflow-hidden text-white"
          style={{ background: `linear-gradient(140deg, ${category.color} 0%, color-mix(in srgb, ${category.color} 55%, #08080d) 60%, #08080d 130%)` }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-25"
            style={{ backgroundImage: "radial-gradient(rgba(255,255,255,.55) 1px, transparent 1.5px)", backgroundSize: "22px 22px" }}
          />
          <div aria-hidden className="absolute -right-16 -bottom-24 size-72 rounded-full bg-white/10 blur-2xl" />
          <span className="relative grid size-24 place-items-center rounded-[32px] border border-white/25 bg-white/15 shadow-float backdrop-blur-sm sm:size-28">
            <CategoryIcon icon={category.icon} className="size-11 sm:size-12" />
          </span>
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent lg:hidden" />
      {children}
    </div>
  );
}

/** Linha de informação com ícone (Quando, Onde, Preço…). */
export function InfoRow({
  icon,
  label,
  title,
  children,
  iconClassName,
}: {
  icon: React.ReactNode;
  label: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  iconClassName?: string;
}) {
  return (
    <div className="flex gap-3.5 py-4 first:pt-0 last:pb-0">
      <div className={cn("grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-primary [&_svg]:size-5", iconClassName)} aria-hidden>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-subtle-foreground uppercase">{label}</p>
        <div className="mt-0.5 text-[15px] font-bold">{title}</div>
        {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}

/** Cores oficiais da classificação indicativa (ClassInd). */
const AGE_STYLE: Record<string, { bg: string; fg: string; short: string; text: string }> = {
  LIVRE: { bg: "#0C9447", fg: "#fff", short: "L", text: "Livre para todos os públicos" },
  A10: { bg: "#0F7DC2", fg: "#fff", short: "10", text: "Não recomendado para menores de 10 anos" },
  A12: { bg: "#F8C411", fg: "#1d1815", short: "12", text: "Não recomendado para menores de 12 anos" },
  A14: { bg: "#E67824", fg: "#fff", short: "14", text: "Não recomendado para menores de 14 anos" },
  A16: { bg: "#DB2827", fg: "#fff", short: "16", text: "Não recomendado para menores de 16 anos" },
  A18: { bg: "#1D1815", fg: "#fff", short: "18", text: "Não recomendado para menores de 18 anos" },
};

export function ageRatingInfo(rating: string) {
  return AGE_STYLE[rating] ?? AGE_STYLE.LIVRE;
}

export function AgeBadge({ rating, className }: { rating: string; className?: string }) {
  const s = ageRatingInfo(rating);
  return (
    <span
      className={cn("grid size-11 shrink-0 place-items-center rounded-2xl text-[15px] font-extrabold ring-1 ring-white/10", className)}
      style={{ background: s.bg, color: s.fg }}
      aria-hidden
    >
      {s.short}
    </span>
  );
}

type Notice = "preview" | "canceled" | "past" | "live";

/** Faixas de estado do evento. */
export function StatusNotice({
  kind,
  children,
  title,
  action,
  className,
}: {
  kind: Notice;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const styles: Record<Notice, string> = {
    preview: "border-warning/30 bg-warning-soft text-warning",
    canceled: "border-danger/30 bg-danger-soft text-danger",
    past: "border-border bg-surface-2 text-foreground",
    live: "border-success/30 bg-success-soft text-success",
  };
  const Icon = kind === "preview" ? Eye : kind === "canceled" ? CircleAlert : kind === "past" ? History : Radio;
  return (
    <div role={kind === "canceled" ? "alert" : "status"} className={cn("flex gap-3 rounded-2xl border p-4", styles[kind], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        {children && <div className="mt-1 text-sm leading-relaxed text-foreground/80">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function LivePill({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success", className)}>
      <span className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />
        <span className="relative size-2 rounded-full bg-success" />
      </span>
      Acontecendo agora
    </span>
  );
}

/** Carrossel horizontal no celular e grade no desktop. */
export function EventRail({
  id,
  title,
  subtitle,
  events,
  href,
  hrefLabel,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  events: EventCardData[];
  href?: string;
  hrefLabel?: string;
}) {
  if (!events.length) return null;
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-24">
      <div className="mb-4 flex items-end justify-between gap-4 px-4 sm:px-6 lg:px-0">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {href && (
          <Button asChild variant="ghost" size="sm" className="-mr-2 shrink-0 text-primary">
            <Link href={href}>
              {hrefLabel ?? "Ver todos"} <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
      <ul className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:scroll-px-6 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0">
        {events.map((ev, i) => (
          <li key={ev.id} className={cn("w-[78%] max-w-[300px] shrink-0 snap-start sm:w-[44%] lg:w-auto lg:max-w-none", i >= 6 && "lg:hidden")}>
            <EventCard event={ev} variant="tile" className="h-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpcomingHint({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
      <Clock3 className="size-3.5" aria-hidden /> {text}
    </span>
  );
}

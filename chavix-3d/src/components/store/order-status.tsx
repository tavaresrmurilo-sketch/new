import type { OrderStatus, ShippingMethod } from "@/generated/prisma/enums";
import { STATUS_DESCRIPTION, STATUS_TONE, statusLabelFor, timelineSteps } from "@/lib/order-status";
import { cn } from "@/lib/cn";

const toneClass = {
  neutral: "bg-sunken text-ink-2",
  waiting: "bg-warning-soft text-warning",
  active: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

export function OrderStatusBadge({ status, method, className }: { status: OrderStatus; method: ShippingMethod; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", toneClass[STATUS_TONE[status]], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {statusLabelFor(status, method)}
    </span>
  );
}

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Linha do tempo do pedido. Cada etapa concluída mostra quando aconteceu. */
export function OrderTimeline({
  status,
  method,
  history,
}: {
  status: OrderStatus;
  method: ShippingMethod;
  history: Array<{ toStatus: OrderStatus; createdAt: Date }>;
}) {
  const steps = timelineSteps(method);
  const reachedAt = new Map<OrderStatus, Date>();
  for (const entry of history) reachedAt.set(entry.toStatus, entry.createdAt);

  if (status === "CANCELLED") {
    const at = reachedAt.get("CANCELLED");
    return (
      <div className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm">
        <p className="font-semibold text-danger">Pedido cancelado</p>
        <p className="mt-1 text-ink-2">
          {at ? `Em ${dateFormat.format(at)}. ` : ""}Se você já tinha pago, fale com a gente para combinar a devolução do valor.
        </p>
      </div>
    );
  }

  // "Pagamento em análise" pode ser pulado quando o admin confirma direto.
  const currentIndex = steps.indexOf(status);
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const done = i < currentIndex || (i === currentIndex && step === "DELIVERED");
        const current = i === currentIndex && step !== "DELIVERED";
        const skipped = step === "PAYMENT_REVIEW" && i < currentIndex && !reachedAt.has("PAYMENT_REVIEW");
        const at = reachedAt.get(step);
        return (
          <li key={step} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && (
              <span className={cn("absolute top-6 left-[11px] h-[calc(100%-1.5rem)] w-0.5", i < currentIndex ? "bg-accent" : "bg-line")} aria-hidden="true" />
            )}
            <span
              className={cn(
                "relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2",
                done ? "border-accent bg-accent text-white" : current ? "border-accent bg-surface" : "border-line-strong bg-surface",
              )}
              aria-hidden="true"
            >
              {done ? (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : current ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
              ) : null}
            </span>
            <div className={cn("-mt-0.5 min-w-0", !done && !current && "opacity-50")}>
              <p className={cn("font-medium", current && "text-accent")}>
                {statusLabelFor(step, method)}
                {skipped && <span className="ml-2 text-xs font-normal text-muted">(confirmado direto)</span>}
              </p>
              {current && <p className="mt-0.5 text-sm text-muted">{STATUS_DESCRIPTION[step]}</p>}
              {at && (done || current) && <p className="spec mt-1 text-muted">{dateFormat.format(at)}</p>}
            </div>
            <span className="sr-only">{done ? "concluído" : current ? "etapa atual" : "pendente"}</span>
          </li>
        );
      })}
    </ol>
  );
}

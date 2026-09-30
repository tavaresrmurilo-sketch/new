import type { OrderDetail } from "@/lib/orders/service";
import { formatBRL } from "@/lib/money";
import { CustomThumb } from "@/components/store/custom-thumb";

type Option = { label: string; value: string };

export function OrderItems({ order }: { order: OrderDetail }) {
  return (
    <div>
      <ul className="divide-y divide-line">
        {order.items.map((item) => {
          const options = (Array.isArray(item.options) ? (item.options as unknown as Option[]) : []).filter((o) => o && o.label);
          return (
            <li key={item.id} className="flex gap-3 py-3">
              <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <CustomThumb color="#5b3df5" />}
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {item.quantity}× {item.productName}
                </p>
                <p className="text-xs text-muted">{[item.variantName, ...options.map((o) => `${o.label}: ${o.value}`)].filter(Boolean).join(" · ")}</p>
              </div>
              <p className="text-sm font-medium tabular-nums">{formatBRL(item.totalCents)}</p>
            </li>
          );
        })}
      </ul>
      <dl className="mt-2 space-y-1.5 border-t border-line pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Subtotal</dt>
          <dd className="tabular-nums">{formatBRL(order.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Frete · {order.shippingLabel}</dt>
          <dd className="tabular-nums">{order.shippingCents === 0 ? "Grátis" : formatBRL(order.shippingCents)}</dd>
        </div>
        {order.discountCents > 0 && (
          <div className="flex justify-between text-success">
            <dt>Desconto{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
            <dd className="tabular-nums">−{formatBRL(order.discountCents)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-line pt-2">
          <dt className="font-medium">Total</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatBRL(order.totalCents)}</dd>
        </div>
      </dl>
    </div>
  );
}

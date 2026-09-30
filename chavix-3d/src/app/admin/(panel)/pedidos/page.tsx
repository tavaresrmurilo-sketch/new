import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { Card, EmptyState, PageHeader, TableWrap, td, th } from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/store/order-status";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";
import { SHIPPING_METHOD_LABEL } from "@/lib/shipping";
import { onlyDigits } from "@/lib/text";
import { cn } from "@/lib/cn";

export const metadata = { title: "Pedidos" };

const PAGE_SIZE = 30;

type Props = { searchParams: Promise<Record<string, string | undefined>> };

function buildHref(params: Record<string, string | undefined>, changes: Record<string, string | null>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...changes })) if (v) next.set(k, v);
  const qs = next.toString();
  return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
}

export default async function OrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80) ?? "";
  const status = ORDER_STATUSES.includes(params.status as OrderStatus) ? (params.status as OrderStatus) : undefined;
  const page = Math.max(1, Number(params.pagina) || 1);
  const from = params.de ? new Date(`${params.de}T00:00:00-03:00`) : undefined;
  const to = params.ate ? new Date(`${params.ate}T23:59:59-03:00`) : undefined;

  const where: Prisma.OrderWhereInput = {};
  if (status) where.status = status;
  if (from && !Number.isNaN(from.getTime())) where.createdAt = { ...(where.createdAt as object), gte: from };
  if (to && !Number.isNaN(to.getTime())) where.createdAt = { ...(where.createdAt as object), lte: to };
  if (q) {
    const digits = onlyDigits(q);
    where.OR = [
      { code: { contains: q.toUpperCase().replace(/^CHX(?!-)/, "CHX-") } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q.toLowerCase() } },
      ...(digits.length >= 4 ? [{ customerPhone: { contains: digits } }] : []),
    ];
  }

  const [orders, total, counts] = await Promise.all([
    db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { _count: { select: { items: true } } } }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);
  const countFor = (s: OrderStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Pedidos" description={`${total} ${total === 1 ? "pedido" : "pedidos"} encontrados`} />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Link href={buildHref(params, { status: null, pagina: null })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", !status ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink/30")}>
          Todos
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildHref(params, { status: s, pagina: null })}
            className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm", status === s ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2 hover:border-ink/30")}
          >
            {STATUS_LABEL[s]} <span className="tabular-nums opacity-60">{countFor(s)}</span>
          </Link>
        ))}
      </div>

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" action="/admin/pedidos">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Buscar por código, nome, e-mail ou telefone" aria-label="Buscar pedidos" className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none" />
        <label className="flex items-center gap-2 text-sm text-muted">
          De <input type="date" name="de" defaultValue={params.de} className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          Até <input type="date" name="ate" defaultValue={params.ate} className="h-10 rounded-md border border-line-strong bg-surface px-2 text-sm text-ink" />
        </label>
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2">
          Filtrar
        </button>
      </form>

      <Card padded={false}>
        {orders.length === 0 ? (
          <EmptyState title="Nenhum pedido encontrado" description={q || status ? "Tente outra busca ou limpe os filtros." : "Os pedidos da loja aparecem aqui assim que forem feitos."} />
        ) : (
          <TableWrap>
            <thead className="border-b border-line bg-sunken/50">
              <tr>
                <th className={th}>Pedido</th>
                <th className={th}>Cliente</th>
                <th className={th}>Status</th>
                <th className={th}>Entrega</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-line last:border-0 hover:bg-sunken/40">
                  <td className={td}>
                    <Link href={`/admin/pedidos/${order.code}`} className="font-mono font-medium hover:text-accent">
                      {order.code}
                    </Link>
                    <p className="text-xs text-muted">
                      {order._count.items} {order._count.items === 1 ? "item" : "itens"}
                      {order.hasCustomItems && " · personalizado"}
                    </p>
                  </td>
                  <td className={td}>{order.customerName}</td>
                  <td className={td}>
                    <OrderStatusBadge status={order.status} method={order.shippingMethod} />
                  </td>
                  <td className={`${td} text-muted`}>{SHIPPING_METHOD_LABEL[order.shippingMethod]}</td>
                  <td className={`${td} text-right font-medium tabular-nums`}>{formatBRL(order.totalCents)}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {pages > 1 && (
        <nav className="mt-6 flex justify-center gap-1" aria-label="Paginação">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildHref(params, { pagina: p > 1 ? String(p) : null })}
              aria-current={p === page ? "page" : undefined}
              className={cn("grid h-9 min-w-9 place-items-center rounded-md px-2 text-sm", p === page ? "bg-ink text-white" : "hover:bg-sunken")}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

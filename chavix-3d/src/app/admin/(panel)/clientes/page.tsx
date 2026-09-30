import Link from "next/link";
import { Card, EmptyState, PageHeader, TableWrap, td, th } from "@/components/admin/ui";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatBRL } from "@/lib/money";
import { maskEmail } from "@/lib/text";

export const metadata = { title: "Clientes" };

type Row = { id: string; name: string; email: string; orders: bigint; paid_total: bigint | null; last_order: Date | null; last_code: string | null };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = `%${q.trim().slice(0, 80)}%`;
  const rows = await db.$queryRaw<Row[]>`
    SELECT c."id", c."name", c."email",
           COUNT(o."id")::bigint AS orders,
           SUM(CASE WHEN o."paidAt" IS NOT NULL AND o."status" <> 'CANCELLED' THEN o."totalCents" ELSE 0 END)::bigint AS paid_total,
           MAX(o."createdAt") AS last_order,
           (SELECT o2."code" FROM "Order" o2 WHERE o2."customerId" = c."id" ORDER BY o2."createdAt" DESC LIMIT 1) AS last_code
    FROM "Customer" c
    LEFT JOIN "Order" o ON o."customerId" = c."id"
    WHERE c."name" ILIKE ${term} OR c."email" ILIKE ${term}
    GROUP BY c."id"
    ORDER BY last_order DESC NULLS LAST
    LIMIT 200`;

  return (
    <>
      <PageHeader title="Clientes" description="Quem já fez pedido. Contato completo fica dentro de cada pedido." />
      <form className="mb-4 flex gap-2" action="/admin/clientes">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" aria-label="Buscar clientes" className="h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm focus:border-accent focus:outline-none" />
        <button type="submit" className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-white">
          Buscar
        </button>
      </form>
      <Card padded={false}>
        {rows.length === 0 ? (
          <EmptyState title="Nenhum cliente ainda" description="Os clientes aparecem aqui depois do primeiro pedido." />
        ) : (
          <TableWrap>
            <thead className="border-b border-line bg-sunken/50">
              <tr>
                <th className={th}>Nome</th>
                <th className={`${th} text-right`}>Pedidos</th>
                <th className={`${th} text-right`}>Total comprado</th>
                <th className={th}>Último pedido</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className={td}>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted">{maskEmail(r.email)}</p>
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{Number(r.orders)}</td>
                  <td className={`${td} text-right font-medium tabular-nums`}>{formatBRL(Number(r.paid_total ?? 0))}</td>
                  <td className={td}>
                    {r.last_code ? (
                      <Link href={`/admin/pedidos/${r.last_code}`} className="font-mono text-sm hover:text-accent">
                        {r.last_code}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {r.last_order && <p className="text-xs text-muted">{formatDate(r.last_order)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Total comprado considera apenas pagamentos confirmados.</p>
    </>
  );
}

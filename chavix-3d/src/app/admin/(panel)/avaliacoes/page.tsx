import Link from "next/link";
import { ReviewActions } from "@/components/admin/review-actions";
import { Card, EmptyState, PageHeader } from "@/components/admin/ui";
import { Stars } from "@/components/home/sections";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Avaliações" };

const LABEL = { PENDING: "Aguardando", APPROVED: "Publicada", HIDDEN: "Oculta" };

export default async function ReviewsPage() {
  const reviews = await db.review.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { order: { select: { code: true } } }, take: 200 });
  return (
    <>
      <PageHeader title="Avaliações" description="Só clientes com pedido entregue conseguem avaliar. Nada aparece na loja sem a sua aprovação." />
      <Card padded={false}>
        {reviews.length === 0 ? (
          <EmptyState title="Nenhuma avaliação ainda" description="Quando um pedido for entregue, o cliente pode avaliar pela página do pedido." />
        ) : (
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <Stars rating={r.rating} />
                    <span className="rounded bg-sunken px-1.5 py-0.5 text-xs text-muted">{LABEL[r.status]}</span>
                  </div>
                  <p className="mt-2 text-ink-2">“{r.comment}”</p>
                  <p className="mt-1 text-xs text-muted">
                    {r.displayName} ·{" "}
                    <Link href={`/admin/pedidos/${r.order.code}`} className="font-mono hover:text-accent">
                      {r.order.code}
                    </Link>{" "}
                    · {formatDateTime(r.createdAt)}
                  </p>
                </div>
                <ReviewActions id={r.id} status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

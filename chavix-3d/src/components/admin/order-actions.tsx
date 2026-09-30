"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { changeOrderStatus, saveInternalNotes } from "@/app/admin/actions/orders";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { OrderStatus } from "@/generated/prisma/enums";
import { ADMIN_ACTION_LABEL } from "@/lib/order-status";

const HINTS: Partial<Record<OrderStatus, string>> = {
  PAID: "Confirme só depois de ver o Pix no extrato, com o valor exato. Fica registrado com seu nome, data e horário.",
  PENDING_PAYMENT: "Use quando não encontrar o Pix. O pedido volta para “Aguardando pagamento” e o cliente pode pagar de novo.",
  CANCELLED: "O estoque reservado volta e o uso do cupom é liberado. Se o cliente já pagou, combine a devolução.",
  SHIPPED: "Se tiver código de rastreio, informe para o cliente acompanhar.",
};

export function OrderActions({ orderId, allowed, totalLabel }: { orderId: string; allowed: OrderStatus[]; totalLabel: string }) {
  const router = useRouter();
  const [target, setTarget] = useState<OrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  if (allowed.length === 0) return <p className="text-sm text-muted">Pedido finalizado. Não há próximas etapas.</p>;

  const primary = allowed.filter((s) => s !== "CANCELLED" && s !== "PENDING_PAYMENT");
  const secondary = allowed.filter((s) => s === "CANCELLED" || s === "PENDING_PAYMENT");

  async function confirm() {
    if (!target) return;
    setBusy(true);
    const result = await changeOrderStatus({ orderId, to: target, note: note || undefined, trackingCode: tracking || undefined });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível atualizar");
      return;
    }
    toast.success(`${ADMIN_ACTION_LABEL[target]}: feito`);
    setTarget(null);
    setNote("");
    setTracking("");
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {primary.map((status) => (
          <Button key={status} variant={status === "PAID" ? "primary" : "dark"} onClick={() => setTarget(status)}>
            {ADMIN_ACTION_LABEL[status]}
          </Button>
        ))}
        {secondary.map((status) => (
          <Button key={status} variant="outline" onClick={() => setTarget(status)} className={status === "CANCELLED" ? "text-danger" : undefined}>
            {ADMIN_ACTION_LABEL[status]}
          </Button>
        ))}
      </div>

      <Dialog.Root open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay fixed inset-0 z-50 bg-ink/40" />
          <Dialog.Content className="pop fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-pop">
            <Dialog.Title className="text-lg font-semibold tracking-tight">{target && ADMIN_ACTION_LABEL[target]}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted">{target && HINTS[target]}</Dialog.Description>
            {target === "PAID" && (
              <p className="mt-4 rounded-lg bg-accent-soft p-3 text-sm">
                Valor esperado: <strong className="tabular-nums">{totalLabel}</strong>
              </p>
            )}
            <div className="mt-4 space-y-4">
              {target === "SHIPPED" && (
                <Field label="Código de rastreio" htmlFor="tracking" optional>
                  <Input id="tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} className="font-mono" />
                </Field>
              )}
              <Field label={target === "CANCELLED" ? "Motivo do cancelamento" : "Observação no histórico"} htmlFor="status-note" optional={target !== "CANCELLED"}>
                <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost">Voltar</Button>
              </Dialog.Close>
              <Button variant={target === "CANCELLED" ? "danger" : "primary"} onClick={confirm} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export function InternalNotes({ orderId, initial }: { orderId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-2">
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder="Anotações visíveis só para a equipe" aria-label="Notas internas" maxLength={2000} />
      <Button
        size="sm"
        variant="outline"
        disabled={saving || value === initial}
        onClick={async () => {
          setSaving(true);
          await saveInternalNotes(orderId, value);
          setSaving(false);
          toast.success("Notas salvas");
        }}
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Salvar notas
      </Button>
    </div>
  );
}

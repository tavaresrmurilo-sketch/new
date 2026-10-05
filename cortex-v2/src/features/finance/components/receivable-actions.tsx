"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, CheckCircle2, Pencil, Plus } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { deleteReceivableAction, generateContractScheduleAction, markReceivedAction } from "../actions";
import type { ReceivableInput } from "../schemas";
import { ReceivableForm } from "./receivable-form";

const todayIso = () => new Date().toISOString().slice(0, 10);

function MarkReceivedForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [date, setDate] = React.useState(todayIso());
  const { run, pending } = useAction(markReceivedAction, { success: "Recebimento confirmado", onSuccess: onDone });
  return (
    <div className="space-y-4 px-5 py-4">
      <Field label="Data do recebimento" htmlFor="mr-date">
        <Input id="mr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button loading={pending} onClick={() => run({ id, receivedAt: date })}>Confirmar recebimento</Button>
      </div>
    </div>
  );
}

export function ReceivableRowActions({
  id,
  status,
  values,
  labels,
}: {
  id: string;
  status: string;
  values: Partial<ReceivableInput>;
  labels: { client?: string | null; contract?: string | null; project?: string | null };
}) {
  const router = useRouter();
  return (
    <div className="flex items-center justify-end gap-1">
      {status === "PENDING" ? (
        <EntityDialog title="Confirmar recebimento" size="sm" trigger={<Button size="xs" variant="outline"><CheckCircle2 /> Baixar</Button>}>
          {(close) => <MarkReceivedForm id={id} onDone={close} />}
        </EntityDialog>
      ) : null}
      <EntityDialog title="Editar recebimento" trigger={<Button size="icon-sm" variant="ghost" aria-label="Editar recebimento"><Pencil /></Button>}>
        {(close) => <ReceivableForm id={id} defaultValues={values} labels={labels} onCancel={close} onDone={() => { close(); router.refresh(); }} />}
      </EntityDialog>
      <DeleteButton action={deleteReceivableAction} id={id} label="recebimento" iconOnly />
    </div>
  );
}

export function NewReceivableButton({ defaults, labels, label = "Novo recebimento" }: { defaults?: Partial<ReceivableInput>; labels?: { client?: string | null; contract?: string | null; project?: string | null }; label?: string }) {
  return (
    <EntityDialog title="Novo recebimento" trigger={<Button size="sm"><Plus /> {label}</Button>}>
      {(close) => <ReceivableForm defaultValues={defaults} labels={labels} onCancel={close} onDone={close} />}
    </EntityDialog>
  );
}

function ScheduleForm({ contractId, recurrence, onDone }: { contractId: string; recurrence: string; onDone: () => void }) {
  const [first, setFirst] = React.useState(todayIso());
  const [n, setN] = React.useState(recurrence === "MONTHLY" ? 12 : recurrence === "QUARTERLY" ? 4 : 1);
  const { run, pending } = useAction(generateContractScheduleAction, { success: (d) => `${d.created} parcela(s) gerada(s)`, onSuccess: onDone });
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-[13px] text-muted-foreground">
        {recurrence === "ONE_TIME"
          ? "Divide o valor do contrato em parcelas mensais a partir do primeiro vencimento."
          : "Cria um recebimento por ciclo de cobrança (valor do contrato por ciclo), respeitando o vencimento do contrato."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Primeiro vencimento" htmlFor="sc-first"><Input id="sc-first" type="date" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
        <Field label="Quantidade de parcelas" htmlFor="sc-n"><Input id="sc-n" type="number" min={1} max={60} value={n} onChange={(e) => setN(Number(e.target.value))} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button loading={pending} onClick={() => run({ contractId, firstDueDate: first, installments: n })}>Gerar parcelas</Button>
      </div>
    </div>
  );
}

export function ContractScheduleButton({ contractId, recurrence }: { contractId: string; recurrence: string }) {
  return (
    <EntityDialog title="Gerar parcelas a receber" size="md" trigger={<Button size="sm" variant="outline"><CalendarRange /> Gerar parcelas</Button>}>
      {(close) => <ScheduleForm contractId={contractId} recurrence={recurrence} onDone={close} />}
    </EntityDialog>
  );
}

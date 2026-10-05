"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteContractAction, renewContractAction } from "../actions";
import type { ContractInput } from "../schemas";
import { ContractForm } from "./contract-form";

function RenewForm({ id, suggestion, onDone }: { id: string; suggestion: { startDate: string; endDate: string; value: number }; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState(suggestion);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-[13px] text-muted-foreground">Cria um novo contrato vinculado ao atual (que passa para “Renovado”), preservando cliente, responsável e condições.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Novo início" htmlFor="rn-start"><Input id="rn-start" type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field>
        <Field label="Novo vencimento" htmlFor="rn-end"><Input id="rn-end" type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} /></Field>
        <Field label="Novo valor (R$)" htmlFor="rn-value"><Input id="rn-value" inputMode="decimal" value={v.value} onChange={(e) => setV({ ...v, value: Number(e.target.value.replace(",", ".")) || 0 })} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await renewContractAction({ id, ...v });
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            toast.success("Contrato renovado");
            onDone();
            router.push(`/app/contracts/${r.data.id}`);
          }}
        >
          Renovar contrato
        </Button>
      </div>
    </div>
  );
}

export function ContractActions({ id, values, clientLabel, renewSuggestion, canWrite, canDelete }: { id: string; values: Partial<ContractInput>; clientLabel: string; renewSuggestion: { startDate: string; endDate: string; value: number } | null; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter();
  return (
    <>
      {canWrite && renewSuggestion ? (
        <EntityDialog title="Renovar contrato" size="md" trigger={<Button size="sm"><RefreshCcw /> Renovar</Button>}>
          {(close) => <RenewForm id={id} suggestion={renewSuggestion} onDone={close} />}
        </EntityDialog>
      ) : null}
      {canWrite ? (
        <EntityDialog title="Editar contrato" trigger={<Button size="sm" variant="outline"><Pencil /> Editar</Button>}>
          {(close) => <ContractForm id={id} defaultValues={values} clientLabel={clientLabel} onCancel={close} onDone={() => { close(); router.refresh(); }} />}
        </EntityDialog>
      ) : null}
      {canDelete ? <DeleteButton action={deleteContractAction} id={id} label="contrato" redirectTo="/app/contracts" /> : null}
    </>
  );
}

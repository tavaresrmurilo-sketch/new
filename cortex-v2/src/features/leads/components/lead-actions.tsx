"use client";

import { useRouter } from "next/navigation";
import { ArrowRightLeft, Pencil } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button } from "@/components/ui/button";
import { deleteLeadAction } from "../actions";
import type { LeadInput } from "../schemas";
import { ConvertLeadForm } from "./convert-lead-form";
import { LeadForm } from "./lead-form";

export function LeadActions({
  lead,
  values,
  canWrite,
  canDelete,
  canConvert,
}: {
  lead: { id: string; name: string; companyName: string | null; potentialValue: number | null; status: string };
  values: Partial<LeadInput>;
  canWrite: boolean;
  canDelete: boolean;
  canConvert: boolean;
}) {
  const router = useRouter();
  const converted = lead.status === "CONVERTED";
  return (
    <>
      {canConvert && !converted ? (
        <EntityDialog
          title="Converter lead"
          description="Cria o cliente, o contato e (opcionalmente) a oportunidade no pipeline."
          size="md"
          trigger={
            <Button size="sm">
              <ArrowRightLeft /> Converter
            </Button>
          }
        >
          {(close) => <ConvertLeadForm lead={lead} onCancel={close} />}
        </EntityDialog>
      ) : null}
      {canWrite && !converted ? (
        <EntityDialog
          title="Editar lead"
          trigger={
            <Button size="sm" variant="outline">
              <Pencil /> Editar
            </Button>
          }
        >
          {(close) => (
            <LeadForm
              id={lead.id}
              defaultValues={values}
              onCancel={close}
              onDone={() => {
                close();
                router.refresh();
              }}
            />
          )}
        </EntityDialog>
      ) : null}
      {canDelete ? <DeleteButton action={deleteLeadAction} id={lead.id} label="lead" redirectTo="/app/leads" /> : null}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { deleteMeetingAction, markMeetingDoneAction } from "../actions";
import type { MeetingInput } from "../schemas";
import { MeetingForm } from "./meeting-form";

export function MeetingActions({ id, status, values, clientLabel, canWrite, canDelete }: { id: string; status: string; values: Partial<MeetingInput>; clientLabel: string | null; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter();
  const done = useAction(markMeetingDoneAction, { success: "Reunião marcada como realizada" });
  return (
    <>
      {canWrite && status === "SCHEDULED" ? (
        <Button size="sm" loading={done.pending} onClick={() => void done.run({ id })}>
          <CheckCircle2 /> Marcar como realizada
        </Button>
      ) : null}
      {canWrite ? (
        <EntityDialog title="Editar reunião" trigger={<Button size="sm" variant="outline"><Pencil /> Editar</Button>}>
          {(close) => <MeetingForm id={id} defaultValues={values} clientLabel={clientLabel} onCancel={close} onDone={() => { close(); router.refresh(); }} />}
        </EntityDialog>
      ) : null}
      {canDelete ? <DeleteButton action={deleteMeetingAction} id={id} label="reunião" redirectTo="/app/meetings" /> : null}
    </>
  );
}

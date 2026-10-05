"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button } from "@/components/ui/button";
import { deleteProjectAction } from "../actions";
import type { ProjectInput } from "../schemas";
import { ProjectForm } from "./project-form";

export function ProjectActions({ id, values, clientLabel, opportunityLabel, canWrite, canDelete }: { id: string; values: Partial<ProjectInput>; clientLabel: string | null; opportunityLabel: string | null; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter();
  return (
    <>
      {canWrite ? (
        <EntityDialog title="Editar projeto" trigger={<Button size="sm" variant="outline"><Pencil /> Editar</Button>}>
          {(close) => (
            <ProjectForm
              id={id}
              defaultValues={values}
              clientLabel={clientLabel}
              opportunityLabel={opportunityLabel}
              onCancel={close}
              onDone={() => {
                close();
                router.refresh();
              }}
            />
          )}
        </EntityDialog>
      ) : null}
      {canDelete ? <DeleteButton action={deleteProjectAction} id={id} label="projeto" redirectTo="/app/projects" /> : null}
    </>
  );
}

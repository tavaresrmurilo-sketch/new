"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, CheckSquare, ChevronDown, FileText, FolderKanban, Pencil } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { useShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteOpportunityAction } from "../actions";
import type { OpportunityInput } from "../schemas";
import { OpportunityForm } from "./opportunity-form";

export function OpportunityActions({ opp, values, canWrite, canDelete }: { opp: { id: string; title: string; clientId: string; clientName: string }; values: Partial<OpportunityInput>; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { openCreate, can, data } = useShell();
  const defaults = { clientId: opp.clientId, opportunityId: opp.id, __clientLabel: opp.clientName, __stay: true };
  return (
    <>
      {!data.readOnly ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              Novo <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {can("tasks.write") ? <DropdownMenuItem onSelect={() => openCreate("task", defaults)}><CheckSquare /> Tarefa</DropdownMenuItem> : null}
            {can("meetings.write") ? <DropdownMenuItem onSelect={() => openCreate("meeting", defaults)}><CalendarPlus /> Reunião</DropdownMenuItem> : null}
            {can("proposals.write") ? <DropdownMenuItem onSelect={() => router.push(`/app/proposals/new?clientId=${opp.clientId}&opportunityId=${opp.id}`)}><FileText /> Proposta</DropdownMenuItem> : null}
            {can("projects.write") ? <DropdownMenuItem onSelect={() => openCreate("project", { ...defaults, name: opp.title })}><FolderKanban /> Projeto</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canWrite ? (
        <EntityDialog title="Editar oportunidade" trigger={<Button size="sm" variant="outline"><Pencil /> Editar</Button>}>
          {(close) => (
            <OpportunityForm
              id={opp.id}
              clientLabel={opp.clientName}
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
      {canDelete ? <DeleteButton action={deleteOpportunityAction} id={opp.id} label="oportunidade" redirectTo="/app/opportunities" /> : null}
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { CalendarPlus, CheckSquare, ChevronDown, FileSignature, FileText, FolderKanban, Pencil, Target } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { useShell, type CreateKind } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteClientAction } from "../actions";
import type { ClientInput } from "../schemas";
import { ClientForm } from "./client-form";

const NEW_ITEMS: { kind: CreateKind; label: string; icon: typeof Target; permission: string }[] = [
  { kind: "opportunity", label: "Oportunidade", icon: Target, permission: "opportunities.write" },
  { kind: "task", label: "Tarefa", icon: CheckSquare, permission: "tasks.write" },
  { kind: "meeting", label: "Reunião", icon: CalendarPlus, permission: "meetings.write" },
  { kind: "project", label: "Projeto", icon: FolderKanban, permission: "projects.write" },
  { kind: "proposal", label: "Proposta", icon: FileText, permission: "proposals.write" },
  { kind: "contract", label: "Contrato", icon: FileSignature, permission: "contracts.write" },
];

export function ClientActions({ client, values, canWrite, canDelete }: { client: { id: string; name: string }; values: Partial<ClientInput>; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { openCreate, can, data } = useShell();
  const items = NEW_ITEMS.filter((i) => can(i.permission));
  return (
    <>
      {items.length && !data.readOnly ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              Novo <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {items.map((i) => (
              <DropdownMenuItem key={i.kind} onSelect={() => openCreate(i.kind, { clientId: client.id, __clientLabel: client.name, __stay: true })}>
                <i.icon /> {i.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canWrite ? (
        <EntityDialog
          title="Editar cliente"
          trigger={
            <Button size="sm" variant="outline">
              <Pencil /> Editar
            </Button>
          }
        >
          {(close) => (
            <ClientForm
              id={client.id}
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
      {canDelete ? <DeleteButton action={deleteClientAction} id={client.id} label="cliente" redirectTo="/app/clients" /> : null}
    </>
  );
}

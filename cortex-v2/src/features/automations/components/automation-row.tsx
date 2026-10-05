"use client";

import { Pencil, Plus } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { useAction } from "@/hooks/use-action";
import { deleteAutomationAction, toggleAutomationAction } from "@/features/integrations/actions";
import { AutomationBuilder, type AutomationValue } from "./automation-builder";

type Opts = { stages: string[]; members: { id: string; name: string }[]; playbooks: { id: string; name: string }[] };

export function NewAutomationButton(props: Opts & { disabled?: boolean }) {
  return (
    <EntityDialog title="Nova automação" size="xl" trigger={<Button size="sm" disabled={props.disabled}><Plus /> Nova automação</Button>}>
      {(close) => <AutomationBuilder {...props} onDone={close} />}
    </EntityDialog>
  );
}

export function AutomationRowActions({ value, enabled, ...opts }: Opts & { value: AutomationValue & { id: string }; enabled: boolean }) {
  const toggle = useAction(toggleAutomationAction, { success: (_d) => "Automação atualizada" });
  return (
    <div className="flex items-center gap-1">
      <Switch checked={enabled} disabled={toggle.pending} onCheckedChange={(c: boolean) => toggle.run({ id: value.id, enabled: c })} aria-label="Ativar automação" />
      <EntityDialog title="Editar automação" size="xl" trigger={<Button size="icon-sm" variant="ghost" aria-label="Editar"><Pencil /></Button>}>
        {(close) => <AutomationBuilder {...opts} initial={value} onDone={close} />}
      </EntityDialog>
      <DeleteButton action={deleteAutomationAction} id={value.id} label="automação" iconOnly />
    </div>
  );
}

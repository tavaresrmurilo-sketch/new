"use client";

import * as React from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect } from "@/components/ui/input";
import { startPlaybookAction } from "@/features/projects/actions";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";

function Starter({ target, onDone }: { target: { clientId?: string; projectId?: string; opportunityId?: string }; onDone: () => void }) {
  const options = useFormOptions();
  const [playbookId, setPlaybookId] = React.useState("");
  const { run, pending } = useAction(startPlaybookAction, { success: (d) => `Playbook iniciado: ${d.taskCount} tarefa(s) criada(s)`, onSuccess: onDone });
  React.useEffect(() => {
    if (options?.playbooks[0] && !playbookId) setPlaybookId(options.playbooks[0].id);
  }, [options, playbookId]);
  if (!options) return <p className="px-5 py-6 text-sm text-muted-foreground">Carregando…</p>;
  if (!options.playbooks.length) {
    return (
      <div className="px-5 py-6 text-sm">
        Nenhum playbook ativo. <Link href="/app/playbooks" className="text-primary hover:underline">Crie um playbook</Link> com os passos do seu processo.
      </div>
    );
  }
  return (
    <div className="space-y-4 px-5 py-4">
      <div className="space-y-1.5">
        <Label htmlFor="pb-select">Playbook</Label>
        <NativeSelect id="pb-select" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
          {options.playbooks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="text-xs text-muted-foreground">Cada passo vira uma tarefa com prazo relativo e responsável definido no playbook.</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button loading={pending} disabled={!playbookId} onClick={() => void run({ playbookId, ...target })}>
          Iniciar playbook
        </Button>
      </div>
    </div>
  );
}

export function StartPlaybookButton({ target }: { target: { clientId?: string; projectId?: string; opportunityId?: string } }) {
  return (
    <EntityDialog title="Iniciar playbook" size="sm" trigger={<Button size="sm" variant="outline"><ListChecks /> Playbook</Button>}>
      {(close) => <Starter target={target} onDone={close} />}
    </EntityDialog>
  );
}

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { executeCommandAction, parseCommandAction } from "../actions";

type Parsed = Awaited<ReturnType<typeof parseCommandAction>> extends { ok: true; data: infer D } | { ok: false } ? D : never;

export function CommandCenter() {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState<Parsed | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function interpret(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    const r = await parseCommandAction({ text });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    if (r.data.kind === "navigate") return router.push(r.data.href);
    setParsed(r.data);
  }
  async function confirm() {
    if (!parsed || (parsed.kind !== "create_task" && parsed.kind !== "create_lead")) return;
    setBusy(true);
    const r = await executeCommandAction(parsed.kind === "create_task" ? { kind: "create_task", title: parsed.title, dueDate: parsed.dueDate } : { kind: "create_lead", name: parsed.name, companyName: parsed.companyName });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.data.message);
    setParsed(null);
    setText("");
    router.push(r.data.href);
  }
  return (
    <div className="space-y-3">
      <form onSubmit={interpret} className="flex gap-2">
        <Input value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }} placeholder="Ex.: criar tarefa Enviar cronograma para a Horizonte amanhã" aria-label="Comando" maxLength={300} />
        <Button type="submit" variant="outline" loading={busy && !parsed}><Terminal /> Interpretar</Button>
      </form>
      {parsed ? (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confirme a ação</p>
          <p className="mt-1 text-sm">{parsed.summary}</p>
          {parsed.kind === "create_task" || parsed.kind === "create_lead" ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" loading={busy} onClick={confirm}><Check /> Confirmar</Button>
              <Button size="sm" variant="ghost" onClick={() => setParsed(null)}>Cancelar</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">Comandos disponíveis: criar tarefa … [hoje | amanhã | em N dias | para DD/MM], criar lead NOME [da EMPRESA], abrir pipeline / radar / relatórios / forecast / decisões / equipe / financeiro. Nada é executado sem confirmação.</p>
    </div>
  );
}

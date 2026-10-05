"use client";

import * as React from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { AUTOMATION_ACTIONS, AUTOMATION_TRIGGERS, OPERATORS, type AutomationTrigger } from "@/lib/automation-catalog";
import { saveAutomationAction } from "@/features/integrations/actions";

type Cond = { field: string; operator: keyof typeof OPERATORS; value: string };
type Act =
  | { type: "create_task"; params: { title: string; dueInDays: number; assignTo: string; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } }
  | { type: "notify"; params: { to: string; message: string } }
  | { type: "add_tag"; params: { tag: string } }
  | { type: "start_playbook"; params: { playbookId: string } };

export interface AutomationValue {
  id?: string;
  name: string;
  description?: string | null;
  trigger: AutomationTrigger;
  conditions: Cond[];
  actions: Act[];
  enabled: boolean;
}

const defaultAction = (type: Act["type"], playbookId = ""): Act =>
  type === "create_task" ? { type, params: { title: "", dueInDays: 1, assignTo: "owner", priority: "MEDIUM" } } : type === "notify" ? { type, params: { to: "owner", message: "" } } : type === "add_tag" ? { type, params: { tag: "" } } : { type, params: { playbookId } };

export function AutomationBuilder({ initial, stages, members, playbooks, onDone }: { initial?: AutomationValue; stages: string[]; members: { id: string; name: string }[]; playbooks: { id: string; name: string }[]; onDone: () => void }) {
  const [v, setV] = React.useState<AutomationValue>(initial ?? { name: "", trigger: "opportunity.stage_changed", conditions: [], actions: [defaultAction("create_task")], enabled: true });
  const { run, pending } = useAction(saveAutomationAction, { success: "Automação salva", onSuccess: onDone });
  const trig = AUTOMATION_TRIGGERS[v.trigger];
  const targets = [{ value: "owner", label: "Responsável do registro" }, { value: "actor", label: "Quem executou a ação" }, { value: "managers", label: "Gestores" }, ...members.map((m) => ({ value: `user:${m.id}`, label: m.name }))];
  const setAct = (i: number, a: Act) => setV((s) => ({ ...s, actions: s.actions.map((x, j) => (j === i ? a : x)) }));
  return (
    <div className="space-y-5 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" htmlFor="au-name" required><Input id="au-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ex.: Proposta enviada → follow-up em 3 dias" /></Field>
        <Field label="Descrição" htmlFor="au-desc"><Input id="au-desc" value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      </div>

      <section className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Quando</p>
        <NativeSelect value={v.trigger} onChange={(e) => setV({ ...v, trigger: e.target.value as AutomationTrigger, conditions: [] })} aria-label="Gatilho">
          {Object.entries(AUTOMATION_TRIGGERS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">{trig.description}</p>
      </section>

      <section className="space-y-2 rounded-lg border p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Se (todas as condições)</p>
        {v.conditions.map((c, i) => {
          const f = (trig.fields as readonly { key: string; label: string; type: string; options?: readonly { value: string; label: string }[] | "stages" }[]).find((x) => x.key === c.field);
          const opts = f?.options === "stages" ? stages.map((s) => ({ value: s, label: s })) : f?.options;
          return (
            <div key={i} className="flex flex-wrap gap-2">
              <NativeSelect className="w-44" value={c.field} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value, value: "" } : x)) })} aria-label="Campo">
                {trig.fields.map((fd) => <option key={fd.key} value={fd.key}>{fd.label}</option>)}
              </NativeSelect>
              <NativeSelect className="w-44" value={c.operator} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, j) => (j === i ? { ...x, operator: e.target.value as Cond["operator"] } : x)) })} aria-label="Operador">
                {Object.entries(OPERATORS).filter(([k]) => (f?.type === "number" ? true : ["equals", "not_equals", "contains"].includes(k))).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </NativeSelect>
              {opts ? (
                <NativeSelect className="flex-1" value={c.value} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} aria-label="Valor">
                  <option value="">Selecione…</option>
                  {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </NativeSelect>
              ) : (
                <Input className="flex-1" value={c.value} inputMode={f?.type === "number" ? "decimal" : undefined} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} aria-label="Valor" />
              )}
              <Button variant="ghost" size="icon" aria-label="Remover condição" onClick={() => setV({ ...v, conditions: v.conditions.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          );
        })}
        {trig.fields.length ? (
          <Button size="xs" variant="outline" onClick={() => setV({ ...v, conditions: [...v.conditions, { field: trig.fields[0]!.key, operator: "equals", value: "" }] })}><Plus /> Condição</Button>
        ) : <p className="text-xs text-muted-foreground">Este gatilho não tem campos para condições.</p>}
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Então</p>
        {v.actions.map((a, i) => (
          <div key={i} className="space-y-2 rounded-md bg-subtle p-2">
            <div className="flex gap-2">
              <NativeSelect value={a.type} onChange={(e) => setAct(i, defaultAction(e.target.value as Act["type"], playbooks[0]?.id))} aria-label="Ação">
                {Object.entries(AUTOMATION_ACTIONS).map(([k, x]) => <option key={k} value={k} disabled={k === "start_playbook" && !playbooks.length}>{x.label}</option>)}
              </NativeSelect>
              {v.actions.length > 1 ? <Button variant="ghost" size="icon" aria-label="Remover ação" onClick={() => setV({ ...v, actions: v.actions.filter((_, j) => j !== i) })}><Trash2 /></Button> : null}
            </div>
            {a.type === "create_task" ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <Input className="sm:col-span-2" placeholder="Título da tarefa" value={a.params.title} onChange={(e) => setAct(i, { ...a, params: { ...a.params, title: e.target.value } })} aria-label="Título" />
                <Input type="number" min={0} value={a.params.dueInDays} onChange={(e) => setAct(i, { ...a, params: { ...a.params, dueInDays: Number(e.target.value) } })} aria-label="Prazo em dias" title="Prazo (dias)" />
                <NativeSelect value={a.params.priority} onChange={(e) => setAct(i, { ...a, params: { ...a.params, priority: e.target.value as "MEDIUM" } })} aria-label="Prioridade"><option value="LOW">Baixa</option><option value="MEDIUM">Média</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></NativeSelect>
                <NativeSelect className="sm:col-span-4" value={a.params.assignTo} onChange={(e) => setAct(i, { ...a, params: { ...a.params, assignTo: e.target.value } })} aria-label="Responsável">{targets.filter((t) => t.value !== "managers").map((t) => <option key={t.value} value={t.value}>Responsável: {t.label}</option>)}</NativeSelect>
              </div>
            ) : a.type === "notify" ? (
              <div className="grid gap-2 sm:grid-cols-3">
                <NativeSelect value={a.params.to} onChange={(e) => setAct(i, { ...a, params: { ...a.params, to: e.target.value } })} aria-label="Destinatário">{targets.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect>
                <Input className="sm:col-span-2" placeholder="Mensagem do alerta interno" value={a.params.message} onChange={(e) => setAct(i, { ...a, params: { ...a.params, message: e.target.value } })} aria-label="Mensagem" />
              </div>
            ) : a.type === "add_tag" ? (
              <Input placeholder="Nome da tag" value={a.params.tag} onChange={(e) => setAct(i, { ...a, params: { tag: e.target.value } })} aria-label="Tag" />
            ) : (
              <NativeSelect value={a.params.playbookId} onChange={(e) => setAct(i, { ...a, params: { playbookId: e.target.value } })} aria-label="Playbook">{playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
            )}
          </div>
        ))}
        <Button size="xs" variant="outline" onClick={() => setV({ ...v, actions: [...v.actions, defaultAction("notify")] })}><Plus /> Ação</Button>
        <p className="text-xs text-muted-foreground">Alertas são sempre internos. Automações nunca enviam mensagens externas a clientes.</p>
      </section>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px]"><Switch checked={v.enabled} onCheckedChange={(c: boolean) => setV({ ...v, enabled: c })} /> Ativa</label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>Cancelar</Button>
          <Button loading={pending} onClick={() => run({ ...v, description: v.description || null, actions: v.actions as never })}><Zap /> Salvar automação</Button>
        </div>
      </div>
    </div>
  );
}

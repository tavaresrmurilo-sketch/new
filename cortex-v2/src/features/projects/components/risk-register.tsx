"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, ShieldAlert } from "lucide-react";
import { Field, FormGrid, applyFieldErrors } from "@/components/common/field";
import { EntityDialog } from "@/components/common/entity-dialog";
import { DeleteButton } from "@/components/common/delete-button";
import { FormShell, FormSkeleton } from "@/components/forms/form-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { useFormOptions } from "@/hooks/use-form-options";
import { IMPACT_LABELS, PROBABILITY_LABELS, RISK_STATUS } from "@/lib/labels";
import { RISK_LEVEL_LABELS, riskLevel } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { deleteRiskAction, saveRiskAction } from "../actions";
import { riskSchema, type RiskInput } from "../schemas";

export interface RiskRow {
  id: string;
  title: string;
  description: string | null;
  impact: number;
  probability: number;
  ownerId: string | null;
  ownerName: string | null;
  mitigation: string | null;
  status: string;
}

function RiskForm({ id, target, defaultValues, onDone }: { id?: string; target: { projectId?: string; opportunityId?: string }; defaultValues?: Partial<RiskInput>; onDone: () => void }) {
  const options = useFormOptions();
  const form = useForm({ resolver: zodResolver(riskSchema), defaultValues: { ...target, title: "", impact: 2, probability: 2, status: "OPEN", ...defaultValues } as RiskInput });
  const { run, pending } = useAction((v: RiskInput) => saveRiskAction({ ...v, id }), { success: "Risco salvo", onSuccess: onDone, onError: (r) => applyFieldErrors(form, r.fieldErrors) });
  if (!options) return <FormSkeleton />;
  const impact = Number(form.watch("impact"));
  const prob = Number(form.watch("probability"));
  const level = RISK_LEVEL_LABELS[riskLevel(impact, prob)];
  return (
    <FormShell onSubmit={form.handleSubmit((v) => run(v))} pending={pending} onCancel={onDone} submitLabel="Salvar risco">
      <FormGrid>
        <Field label="Risco" htmlFor="r-title" required error={form.formState.errors.title?.message} className="sm:col-span-2">
          <Input id="r-title" autoFocus {...form.register("title")} placeholder="Ex.: Atraso na entrega de material pelo fornecedor" />
        </Field>
        <Field label="Impacto" htmlFor="r-impact">
          <NativeSelect id="r-impact" {...form.register("impact")}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{IMPACT_LABELS[n]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Probabilidade" htmlFor="r-prob">
          <NativeSelect id="r-prob" {...form.register("probability")}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{PROBABILITY_LABELS[n]}</option>)}
          </NativeSelect>
        </Field>
        <div className="sm:col-span-2 text-sm">
          Nível na matriz: <Badge tone={level.tone}>{level.label}</Badge>
        </div>
        <Field label="Responsável" htmlFor="r-owner">
          <NativeSelect id="r-owner" {...form.register("ownerId")}>
            <option value="">—</option>
            {options.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Status" htmlFor="r-status">
          <NativeSelect id="r-status" {...form.register("status")}>
            {Object.entries(RISK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Plano de mitigação" htmlFor="r-mit" className="sm:col-span-2">
          <Textarea id="r-mit" rows={3} {...form.register("mitigation")} />
        </Field>
        <Field label="Descrição" htmlFor="r-desc" className="sm:col-span-2">
          <Textarea id="r-desc" rows={2} {...form.register("description")} />
        </Field>
      </FormGrid>
    </FormShell>
  );
}

const CELL_TONE: Record<string, string> = {
  LOW: "bg-emerald-500/10",
  MEDIUM: "bg-sky-500/10",
  HIGH: "bg-amber-500/15",
  CRITICAL: "bg-rose-500/20",
};

/** Registro de Riscos com matriz impacto × probabilidade (baixo, médio, alto, crítico). */
export function RiskRegister({ risks, target, canWrite }: { risks: RiskRow[]; target: { projectId?: string; opportunityId?: string }; canWrite: boolean }) {
  const open = risks.filter((r) => r.status === "OPEN" || r.status === "MITIGATING");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">{open.length} risco(s) ativo(s) de {risks.length} registrado(s).</p>
        {canWrite ? (
          <EntityDialog title="Novo risco" trigger={<Button size="sm" variant="outline"><Plus /> Registrar risco</Button>}>
            {(close) => <RiskForm target={target} onDone={close} />}
          </EntityDialog>
        ) : null}
      </div>
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Matriz (riscos ativos)</p>
          <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-1 text-[11px]" role="table" aria-label="Matriz de riscos">
            {[4, 3, 2, 1].map((impact) => (
              <React.Fragment key={impact}>
                <span className="flex items-center pr-1 text-muted-foreground" role="rowheader">{IMPACT_LABELS[impact]}</span>
                {[1, 2, 3, 4].map((prob) => {
                  const n = open.filter((r) => r.impact === impact && r.probability === prob).length;
                  return (
                    <span key={prob} role="cell" className={cn("flex aspect-square items-center justify-center rounded font-semibold", CELL_TONE[riskLevel(impact, prob)])} title={`Impacto ${IMPACT_LABELS[impact]} × ${PROBABILITY_LABELS[prob]}`}>
                      {n || ""}
                    </span>
                  );
                })}
              </React.Fragment>
            ))}
            <span />
            {[1, 2, 3, 4].map((p) => (
              <span key={p} className="text-center text-muted-foreground">{PROBABILITY_LABELS[p]}</span>
            ))}
          </div>
          <p className="mt-1 text-center text-[11px] text-muted-foreground">Probabilidade →</p>
        </div>
        <div className="space-y-2">
          {risks.length ? (
            risks.map((r) => {
              const level = RISK_LEVEL_LABELS[riskLevel(r.impact, r.probability)];
              return (
                <div key={r.id} className={cn("rounded-lg border bg-card p-3", (r.status === "CLOSED") && "opacity-60")}>
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge tone={level.tone}>{level.label}</Badge>
                        Impacto {IMPACT_LABELS[r.impact]} · Probabilidade {PROBABILITY_LABELS[r.probability]} · {RISK_STATUS[r.status]?.label} · {r.ownerName ?? "sem responsável"}
                      </p>
                      {r.mitigation ? <p className="mt-1.5 text-[13px]"><span className="font-medium">Mitigação:</span> {r.mitigation}</p> : null}
                    </div>
                    {canWrite ? (
                      <div className="flex">
                        <EntityDialog title="Editar risco" trigger={<Button size="icon-sm" variant="ghost" aria-label="Editar risco"><Pencil /></Button>}>
                          {(close) => (
                            <RiskForm
                              id={r.id}
                              target={target}
                              defaultValues={{ title: r.title, description: r.description, impact: r.impact, probability: r.probability, ownerId: r.ownerId, mitigation: r.mitigation, status: r.status as RiskInput["status"] }}
                              onDone={close}
                            />
                          )}
                        </EntityDialog>
                        <DeleteButton action={deleteRiskAction} id={r.id} label="risco" iconOnly />
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nenhum risco registrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

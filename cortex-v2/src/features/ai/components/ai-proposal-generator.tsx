"use client";

import * as React from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Field, FormGrid } from "@/components/common/field";
import { RecordPicker } from "@/components/forms/record-picker";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { ProposalInput } from "@/features/proposals/schemas";
import { addDaysToKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { generateProposalDraftAction } from "../actions";
import { AiUnavailable } from "./ai-unavailable";

/** Gerador de propostas com IA: o resultado preenche o editor para revisão humana antes de salvar. */
export function AiProposalGenerator({
  availability,
  defaultClient,
  onGenerated,
}: {
  availability: { enabled: boolean; reason?: string };
  defaultClient: { id: string | null; label: string | null };
  onGenerated: (values: Partial<ProposalInput>, clientLabel: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [clientId, setClientId] = React.useState(defaultClient.id);
  const [clientLabel, setClientLabel] = React.useState(defaultClient.label);
  const [service, setService] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [value, setValue] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="rounded-lg border bg-gradient-to-br from-primary/[0.04] to-transparent">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
        <Sparkles className="size-4 text-primary" />
        <span className="text-sm font-medium">Gerar estrutura com o Córtex AI</span>
        <span className="text-xs text-muted-foreground">— você revisa tudo antes de salvar</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="space-y-4 border-t px-4 py-4">
          {!availability.enabled ? (
            <AiUnavailable reason={availability.reason} compact />
          ) : (
            <>
              <FormGrid>
                <Field label="Cliente" htmlFor="ai-client" required>
                  <RecordPicker id="ai-client" type="client" value={clientId} label={clientLabel} onChange={(v, item) => { setClientId(v); setClientLabel(item?.title ?? null); }} />
                </Field>
                <Field label="Serviço" htmlFor="ai-service" required>
                  <Input id="ai-service" value={service} onChange={(e) => setService(e.target.value)} placeholder="Ex.: Inspeção predial com laudo técnico" />
                </Field>
                <Field label="Objetivo do cliente" htmlFor="ai-obj" required className="sm:col-span-2">
                  <Textarea id="ai-obj" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex.: Atender exigência do seguro e planejar manutenção preventiva" />
                </Field>
                <Field label="Valor estimado (R$)" htmlFor="ai-value">
                  <Input id="ai-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
                </Field>
                <Field label="Prazo" htmlFor="ai-deadline">
                  <Input id="ai-deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} placeholder="Ex.: 30 dias" />
                </Field>
              </FormGrid>
              <Button
                type="button"
                loading={busy}
                disabled={!clientId || service.trim().length < 3 || objective.trim().length < 3}
                onClick={async () => {
                  setBusy(true);
                  const r = await generateProposalDraftAction({ clientId: clientId!, service, objective, estimatedValue: value ? Number(value.replace(/\./g, "").replace(",", ".")) : undefined, deadline: deadline || undefined });
                  setBusy(false);
                  if (!r.ok) return toast.error(r.error);
                  const d = r.data.draft;
                  const today = new Date().toISOString().slice(0, 10);
                  onGenerated(
                    {
                      title: d.title,
                      clientId: clientId!,
                      scope: d.scope,
                      notes: d.notes,
                      items: d.items.map((i) => ({ description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice })),
                      validUntil: addDaysToKey(today, d.validityDays),
                      aiGenerated: true,
                    },
                    r.data.clientName,
                  );
                  toast.success("Estrutura gerada. Revise os itens e valores antes de salvar.");
                  setOpen(false);
                }}
              >
                <Sparkles /> Gerar estrutura
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

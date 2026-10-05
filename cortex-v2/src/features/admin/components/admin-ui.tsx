"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/controls";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { FEATURES } from "@/lib/features";
import type { ActionResult } from "@/types/action";
import { enterSupportModeAction } from "../support-actions";
import { savePlanAction, savePlatformSettingAction, setOrgBlockedAction, setUserStatusAction, updateSubscriptionAction } from "../actions";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = async <T,>(p: Promise<ActionResult<T>>, ok: string) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    toast.success(ok);
    router.refresh();
    return r.data;
  };
  return { run, busy };
}

export function OrgActions({ id, name, blocked }: { id: string; name: string; blocked: boolean }) {
  const { run, busy } = useRun();
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <EntityDialog title={`Modo suporte: ${name}`} size="md" trigger={<Button size="xs" variant="outline">Acessar (suporte)</Button>}>
        {(close) => (
          <div className="space-y-3 px-5 py-4">
            <p className="text-[13px] text-muted-foreground">Acesso somente leitura, registrado no log de auditoria do workspace com o motivo informado.</p>
            <Field label="Motivo do acesso" htmlFor="sp-reason"><Textarea id="sp-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button loading={busy} onClick={async () => { const d = await run(enterSupportModeAction({ organizationId: id, reason }), "Modo suporte ativado"); if (d) router.push(d.redirectTo); }}>Entrar</Button>
            </div>
          </div>
        )}
      </EntityDialog>
      <ConfirmDialog
        title={blocked ? `Desbloquear ${name}?` : `Bloquear ${name}?`}
        description={blocked ? "Os usuários voltam a acessar o workspace." : "Os usuários perdem o acesso até o desbloqueio. Os dados são preservados."}
        confirmLabel={blocked ? "Desbloquear" : "Bloquear"}
        destructive={!blocked}
        trigger={<Button size="xs" variant="ghost" className={blocked ? "" : "text-destructive"}>{blocked ? "Desbloquear" : "Bloquear"}</Button>}
        onConfirm={() => run(setOrgBlockedAction({ organizationId: id, blocked: !blocked }), blocked ? "Workspace desbloqueado" : "Workspace bloqueado")}
      />
    </div>
  );
}

export function UserStatusButton({ id, status }: { id: string; status: "ACTIVE" | "BLOCKED" }) {
  const { run } = useRun();
  const next = status === "ACTIVE" ? "BLOCKED" : "ACTIVE";
  return (
    <ConfirmDialog title={next === "BLOCKED" ? "Bloquear usuário?" : "Reativar usuário?"} description={next === "BLOCKED" ? "Todas as sessões serão encerradas." : undefined} confirmLabel={next === "BLOCKED" ? "Bloquear" : "Reativar"} destructive={next === "BLOCKED"} trigger={<Button size="xs" variant="ghost">{next === "BLOCKED" ? "Bloquear" : "Reativar"}</Button>} onConfirm={() => run(setUserStatusAction({ userId: id, status: next }), "Usuário atualizado")} />
  );
}

type PlanRow = Parameters<typeof savePlanAction>[0] & { key: string };
const LIMIT_FIELDS = [["maxUsers", "Usuários"], ["maxStorageMb", "Armazenamento (MB)"], ["maxAutomations", "Automações"], ["maxAiRequestsMonth", "IA/mês"], ["maxApiKeys", "API keys"], ["maxWebhooks", "Webhooks"]] as const;

export function PlanEditor({ plan }: { plan: PlanRow }) {
  const { run, busy } = useRun();
  const [v, setV] = React.useState(plan);
  const numOrNull = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s))));
  return (
    <EntityDialog title={`Plano ${plan.name}`} size="xl" trigger={<Button size="xs" variant="outline">Editar</Button>}>
      {(close) => (
        <div className="space-y-3 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nome" htmlFor="pl-n"><Input id="pl-n" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="Preço mensal (centavos)" htmlFor="pl-m" hint="Vazio = sob consulta"><Input id="pl-m" value={v.priceMonthlyCents ?? ""} onChange={(e) => setV({ ...v, priceMonthlyCents: numOrNull(e.target.value) })} /></Field>
            <Field label="Preço anual (centavos)" htmlFor="pl-y"><Input id="pl-y" value={v.priceYearlyCents ?? ""} onChange={(e) => setV({ ...v, priceYearlyCents: numOrNull(e.target.value) })} /></Field>
            <Field label="Descrição" htmlFor="pl-d" className="sm:col-span-3"><Input id="pl-d" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
            <Field label="Dias de teste" htmlFor="pl-t"><Input id="pl-t" type="number" value={v.trialDays} onChange={(e) => setV({ ...v, trialDays: Number(e.target.value) })} /></Field>
            {LIMIT_FIELDS.map(([k, l]) => <Field key={k} label={`${l} (vazio = ilimitado)`} htmlFor={`pl-${k}`}><Input id={`pl-${k}`} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: numOrNull(e.target.value) })} /></Field>)}
            <Field label="Stripe price (mensal)" htmlFor="pl-sm"><Input id="pl-sm" value={v.stripePriceMonthlyId ?? ""} onChange={(e) => setV({ ...v, stripePriceMonthlyId: e.target.value || null })} /></Field>
            <Field label="Stripe price (anual)" htmlFor="pl-sy"><Input id="pl-sy" value={v.stripePriceYearlyId ?? ""} onChange={(e) => setV({ ...v, stripePriceYearlyId: e.target.value || null })} /></Field>
          </div>
          <fieldset className="grid gap-1 sm:grid-cols-2">
            <legend className="mb-1 text-xs font-medium">Recursos</legend>
            {Object.entries(FEATURES).map(([k, l]) => <label key={k} className="flex items-center gap-2 text-[13px]"><Checkbox checked={v.features.includes(k)} onCheckedChange={(c) => setV({ ...v, features: c ? [...v.features, k] : v.features.filter((x) => x !== k) })} /> {l}</label>)}
          </fieldset>
          <Field label="Destaques (um por linha)" htmlFor="pl-h"><Textarea id="pl-h" rows={4} value={v.highlights.join("\n")} onChange={(e) => setV({ ...v, highlights: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} /></Field>
          <div className="flex gap-4 text-[13px]">
            <label className="flex items-center gap-2"><Switch checked={v.isPublic} onCheckedChange={(c: boolean) => setV({ ...v, isPublic: c })} /> Público</label>
            <label className="flex items-center gap-2"><Switch checked={v.isActive} onCheckedChange={(c: boolean) => setV({ ...v, isActive: c })} /> Ativo</label>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancelar</Button><Button loading={busy} onClick={async () => { const { key: _k, ...rest } = v; if ((await run(savePlanAction(rest), "Plano salvo")) !== null) close(); }}>Salvar</Button></div>
        </div>
      )}
    </EntityDialog>
  );
}

export function SubscriptionEditor({ organizationId, planId, status, trialEndsAt, plans }: { organizationId: string; planId: string | null; status: string | null; trialEndsAt: string | null; plans: { id: string; name: string }[] }) {
  const { run, busy } = useRun();
  const [v, setV] = React.useState({ planId: planId ?? plans[0]?.id ?? "", status: (status ?? "TRIALING") as "ACTIVE", trialEndsAt: trialEndsAt ?? "" });
  return (
    <EntityDialog title="Alterar assinatura" size="md" trigger={<Button size="xs" variant="outline">Alterar</Button>}>
      {(close) => (
        <div className="space-y-3 px-5 py-4">
          <Field label="Plano" htmlFor="sb-p"><NativeSelect id="sb-p" value={v.planId} onChange={(e) => setV({ ...v, planId: e.target.value })}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
          <Field label="Status" htmlFor="sb-s"><NativeSelect id="sb-s" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as "ACTIVE" })}>{["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "SUSPENDED"].map((s) => <option key={s} value={s}>{s}</option>)}</NativeSelect></Field>
          <Field label="Fim do teste" htmlFor="sb-t"><Input id="sb-t" type="date" value={v.trialEndsAt} onChange={(e) => setV({ ...v, trialEndsAt: e.target.value })} /></Field>
          <p className="text-xs text-muted-foreground">Alteração manual (ex.: contrato fechado fora do Stripe). Fica registrada na auditoria.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancelar</Button><Button loading={busy} onClick={async () => { if ((await run(updateSubscriptionAction({ organizationId, ...v, trialEndsAt: v.trialEndsAt || null }), "Assinatura atualizada")) !== null) close(); }}>Salvar</Button></div>
        </div>
      )}
    </EntityDialog>
  );
}

export function PlatformSettingRow({ k, label, value }: { k: string; label: string; value: string | number | boolean }) {
  const { run, busy } = useRun();
  const [v, setV] = React.useState(String(value));
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-[13px]">
      <span className="flex-1">{label} <code className="text-[11px] text-muted-foreground">{k}</code></span>
      {typeof value === "boolean" ? (
        <Switch checked={v === "true"} disabled={busy} onCheckedChange={(c: boolean) => { setV(String(c)); void run(savePlatformSettingAction({ key: k, value: c }), "Salvo"); }} />
      ) : (
        <>
          <Input className="h-8 w-40" value={v} onChange={(e) => setV(e.target.value)} />
          <Button size="xs" variant="outline" loading={busy} onClick={() => run(savePlatformSettingAction({ key: k, value: typeof value === "number" ? Number(v) : v }), "Salvo")}>Salvar</Button>
        </>
      )}
    </li>
  );
}

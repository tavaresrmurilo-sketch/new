"use client";

import * as React from "react";
import { Copy, KeyRound, Plus, Send, Webhook } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox, Switch } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { createApiKeyAction, createWebhookAction, deleteWebhookAction, revokeApiKeyAction, testWebhookAction, updateWebhookAction } from "../actions";

function SecretReveal({ label, value, onClose }: { label: string; value: string; onClose: () => void }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="text-[13px]">{label} <b>Ela não será exibida novamente.</b></p>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button variant="outline" onClick={() => { void navigator.clipboard.writeText(value); toast.success("Copiado"); }}><Copy /> Copiar</Button>
      </div>
      <div className="flex justify-end"><Button onClick={onClose}>Concluir</Button></div>
    </div>
  );
}

function ApiKeyForm({ scopes, onClose }: { scopes: Record<string, string>; onClose: () => void }) {
  const [name, setName] = React.useState("");
  const [sel, setSel] = React.useState<string[]>([]);
  const [expires, setExpires] = React.useState("0");
  const [created, setCreated] = React.useState<string | null>(null);
  const { run, pending } = useAction(createApiKeyAction, { onSuccess: (d) => setCreated(d.key) });
  if (created) return <SecretReveal label="Copie sua API key agora." value={created} onClose={onClose} />;
  return (
    <div className="space-y-3 px-5 py-4">
      <Field label="Nome" htmlFor="ak-name"><Input id="ak-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Integração com o site" /></Field>
      <fieldset className="grid gap-1.5 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-medium">Escopos</legend>
        {Object.entries(scopes).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-[13px]"><Checkbox checked={sel.includes(k)} onCheckedChange={(c) => setSel((s) => (c ? [...s, k] : s.filter((x) => x !== k)))} /> {l} <span className="text-[11px] text-muted-foreground">{k}</span></label>
        ))}
      </fieldset>
      <Field label="Expiração" htmlFor="ak-exp">
        <NativeSelect id="ak-exp" value={expires} onChange={(e) => setExpires(e.target.value)}>
          <option value="0">Sem expiração</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option>
        </NativeSelect>
      </Field>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button loading={pending} onClick={() => run({ name, scopes: sel as never, expiresInDays: Number(expires) })}><KeyRound /> Gerar chave</Button></div>
    </div>
  );
}

export function NewApiKeyButton({ scopes, disabled }: { scopes: Record<string, string>; disabled?: boolean }) {
  return (
    <EntityDialog title="Nova API key" size="md" trigger={<Button size="sm" disabled={disabled}><Plus /> Nova API key</Button>}>
      {(close) => <ApiKeyForm scopes={scopes} onClose={close} />}
    </EntityDialog>
  );
}

export function RevokeApiKeyButton({ id, name }: { id: string; name: string }) {
  const { run } = useAction(revokeApiKeyAction, { success: "Chave revogada" });
  return <ConfirmDialog title={`Revogar “${name}”?`} description="Sistemas que usam esta chave deixarão de ter acesso imediatamente." confirmLabel="Revogar" destructive trigger={<Button size="xs" variant="ghost" className="text-destructive">Revogar</Button>} onConfirm={() => run({ id })} />;
}

function WebhookForm({ events, initial, onClose }: { events: Record<string, string>; initial?: { id: string; name: string; url: string; events: string[]; enabled: boolean }; onClose: () => void }) {
  const [v, setV] = React.useState({ name: initial?.name ?? "", url: initial?.url ?? "https://", events: initial?.events ?? [], enabled: initial?.enabled ?? true });
  const [secret, setSecret] = React.useState<string | null>(null);
  const create = useAction(createWebhookAction, { onSuccess: (d) => setSecret(d.secret) });
  const update = useAction(updateWebhookAction, { success: "Webhook atualizado", onSuccess: onClose });
  if (secret) return <SecretReveal label="Use este segredo para validar a assinatura HMAC (header X-Cortex-Signature)." value={secret} onClose={onClose} />;
  const payload = { ...v, events: v.events as never };
  return (
    <div className="space-y-3 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" htmlFor="wh-name"><Input id="wh-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="URL (https, pública)" htmlFor="wh-url"><Input id="wh-url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} /></Field>
      </div>
      <fieldset className="grid gap-1.5 sm:grid-cols-2">
        <legend className="mb-1 text-xs font-medium">Eventos</legend>
        {Object.entries(events).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-[13px]"><Checkbox checked={v.events.includes(k)} onCheckedChange={(c) => setV((s) => ({ ...s, events: c ? [...s.events, k] : s.events.filter((x) => x !== k) }))} /> {l} <span className="text-[11px] text-muted-foreground">{k}</span></label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-[13px]"><Switch checked={v.enabled} onCheckedChange={(c: boolean) => setV({ ...v, enabled: c })} /> Ativo</label>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button loading={create.pending || update.pending} onClick={() => (initial ? update.run({ id: initial.id, ...payload }) : create.run(payload))}><Webhook /> {initial ? "Salvar" : "Criar webhook"}</Button>
      </div>
    </div>
  );
}

export function WebhookButton({ events, initial, disabled }: { events: Record<string, string>; initial?: { id: string; name: string; url: string; events: string[]; enabled: boolean }; disabled?: boolean }) {
  return (
    <EntityDialog title={initial ? "Editar webhook" : "Novo webhook"} size="lg" trigger={initial ? <Button size="xs" variant="outline">Editar</Button> : <Button size="sm" disabled={disabled}><Plus /> Novo webhook</Button>}>
      {(close) => <WebhookForm events={events} initial={initial} onClose={close} />}
    </EntityDialog>
  );
}

export function WebhookRowActions({ id, name }: { id: string; name: string }) {
  const test = useAction(testWebhookAction, { success: (d) => (d.status === "SUCCESS" ? `Entregue (HTTP ${d.responseStatus})` : `Falhou: ${d.error ?? `HTTP ${d.responseStatus}`}`) });
  const del = useAction(deleteWebhookAction, { success: "Webhook removido" });
  return (
    <>
      <Button size="xs" variant="outline" loading={test.pending} onClick={() => test.run({ id })}><Send /> Testar</Button>
      <ConfirmDialog title={`Excluir “${name}”?`} description="O histórico de entregas também será removido." confirmLabel="Excluir" destructive trigger={<Button size="xs" variant="ghost" className="text-destructive">Excluir</Button>} onConfirm={() => del.run({ id })} />
    </>
  );
}

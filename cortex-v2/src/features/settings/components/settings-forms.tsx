"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { useAction } from "@/hooks/use-action";
import type { OrgSettings } from "@/lib/org-settings";
import { cancelOrgDeletionAction, changePasswordAction, requestOrgDeletionAction, revokeSessionAction, updateCompanyAction, updateOrgSettingsAction, updateProfileAction } from "../actions";

function FormCard({ title, description, children, onSubmit, pending, submitLabel = "Salvar" }: { title: string; description?: string; children: React.ReactNode; onSubmit: () => void; pending: boolean; submitLabel?: string }) {
  return (
    <form
      className="rounded-lg border bg-card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-[13px] text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
      <div className="flex justify-end border-t px-5 py-3">
        <Button type="submit" size="sm" loading={pending}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function ProfileForm({ initial }: { initial: { name: string; avatarUrl: string | null; email: string } }) {
  const [v, setV] = React.useState({ name: initial.name, avatarUrl: initial.avatarUrl ?? "" });
  const { run, pending } = useAction(updateProfileAction, { success: "Perfil atualizado" });
  return (
    <FormCard title="Perfil" description={`E-mail de acesso: ${initial.email}`} onSubmit={() => run(v)} pending={pending}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" htmlFor="pf-name" required><Input id="pf-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="URL da foto (https)" htmlFor="pf-avatar" hint="Opcional"><Input id="pf-avatar" value={v.avatarUrl} onChange={(e) => setV({ ...v, avatarUrl: e.target.value })} /></Field>
      </div>
    </FormCard>
  );
}

export function PasswordForm() {
  const [v, setV] = React.useState({ current: "", next: "", confirm: "" });
  const { run, pending } = useAction(changePasswordAction, { success: "Senha alterada. As outras sessões foram encerradas.", onSuccess: () => setV({ current: "", next: "", confirm: "" }) });
  return (
    <FormCard
      title="Alterar senha"
      description="Mínimo de 10 caracteres, com letras e números. Ao alterar, as demais sessões são encerradas."
      pending={pending}
      onSubmit={() => {
        if (v.next !== v.confirm) return void toast.error("A confirmação não confere com a nova senha.");
        void run({ current: v.current, next: v.next });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Senha atual" htmlFor="pw-cur"><Input id="pw-cur" type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV({ ...v, current: e.target.value })} /></Field>
        <Field label="Nova senha" htmlFor="pw-new"><Input id="pw-new" type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV({ ...v, next: e.target.value })} /></Field>
        <Field label="Confirmar nova senha" htmlFor="pw-conf"><Input id="pw-conf" type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} /></Field>
      </div>
    </FormCard>
  );
}

export function SessionRevokeButton({ id, all }: { id?: string; all?: boolean }) {
  const { run, pending } = useAction(revokeSessionAction, { success: all ? "Outras sessões encerradas" : "Sessão encerrada" });
  return (
    <Button size="xs" variant="outline" loading={pending} onClick={() => run(all ? { allOthers: true } : { id })}>
      {all ? "Encerrar todas as outras" : "Encerrar"}
    </Button>
  );
}

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza", "America/Recife", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha", "UTC"];

export function CompanyForm({ initial, canEdit }: { initial: { name: string; legalName: string | null; document: string | null; segment: string | null; timezone: string; currency: string; logoUrl: string | null }; canEdit: boolean }) {
  const [v, setV] = React.useState({ ...initial, legalName: initial.legalName ?? "", document: initial.document ?? "", segment: initial.segment ?? "", logoUrl: initial.logoUrl ?? "" });
  const { run, pending } = useAction(updateCompanyAction, { success: "Dados da empresa atualizados" });
  return (
    <FormCard title="Dados da empresa" onSubmit={() => canEdit && run({ ...v, currency: v.currency as "BRL" })} pending={pending}>
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" htmlFor="co-name" required><Input id="co-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Razão social" htmlFor="co-legal"><Input id="co-legal" value={v.legalName} onChange={(e) => setV({ ...v, legalName: e.target.value })} /></Field>
        <Field label="CNPJ / CPF" htmlFor="co-doc"><Input id="co-doc" value={v.document} onChange={(e) => setV({ ...v, document: e.target.value })} /></Field>
        <Field label="Segmento" htmlFor="co-seg"><Input id="co-seg" value={v.segment} onChange={(e) => setV({ ...v, segment: e.target.value })} /></Field>
        <Field label="Fuso horário" htmlFor="co-tz">
          <NativeSelect id="co-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
            {[...new Set([v.timezone, ...TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Moeda" htmlFor="co-cur">
          <NativeSelect id="co-cur" value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>
            <option value="BRL">Real (BRL)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option>
          </NativeSelect>
        </Field>
        <Field label="URL do logotipo (https)" htmlFor="co-logo" className="sm:col-span-2"><Input id="co-logo" value={v.logoUrl} onChange={(e) => setV({ ...v, logoUrl: e.target.value })} /></Field>
      </fieldset>
    </FormCard>
  );
}

const csv = (xs: (string | number)[]) => xs.join(", ");
const parseList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function OperationalSettingsForm({ initial, canEdit }: { initial: OrgSettings; canEdit: boolean }) {
  const [v, setV] = React.useState({
    followUpDays: String(initial.followUpDays),
    briefInactiveClientDays: String(initial.briefInactiveClientDays),
    inactiveClientDays: String(initial.inactiveClientDays),
    largeDealThreshold: String(initial.largeDealThreshold),
    proposalValidityDays: String(initial.proposalValidityDays),
    defaultWeeklyCapacity: String(initial.defaultWeeklyCapacity),
    contractAlertDays: csv(initial.contractAlertDays),
    departments: csv(initial.departments),
    industries: csv(initial.industries),
    taxes: initial.proposalTaxes.map((t) => `${t.name}:${t.rate}`).join(", "),
  });
  const { run, pending } = useAction(updateOrgSettingsAction, { success: "Configurações salvas" });
  const num = (k: keyof typeof v) => Number(v[k].replace(",", "."));
  const field = (k: keyof typeof v, label: string, hint?: string) => (
    <Field label={label} htmlFor={`os-${k}`} hint={hint}><Input id={`os-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>
  );
  return (
    <FormCard
      title="Regras operacionais"
      description="Parâmetros usados pelos alertas, Morning Brief, radar, aprovações e propostas."
      pending={pending}
      onSubmit={() => {
        if (!canEdit) return;
        const taxes = parseList(v.taxes).map((t) => {
          const [name, rate] = t.split(":");
          return { name: (name ?? "").trim(), rate: Number((rate ?? "").replace(",", ".")) };
        });
        if (taxes.some((t) => !t.name || !Number.isFinite(t.rate))) return void toast.error("Impostos: use o formato NOME:ALÍQUOTA, separados por vírgula (ex.: ISS:5, PIS:0,65).");
        void run({
          followUpDays: num("followUpDays"),
          briefInactiveClientDays: num("briefInactiveClientDays"),
          inactiveClientDays: num("inactiveClientDays"),
          largeDealThreshold: num("largeDealThreshold"),
          proposalValidityDays: num("proposalValidityDays"),
          defaultWeeklyCapacity: num("defaultWeeklyCapacity"),
          contractAlertDays: parseList(v.contractAlertDays).map(Number).filter((n) => n > 0),
          departments: parseList(v.departments),
          industries: parseList(v.industries),
          proposalTaxes: taxes,
        });
      }}
    >
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        {field("followUpDays", "Follow-up após (dias)", "Propostas enviadas sem retorno")}
        {field("briefInactiveClientDays", "Brief: cliente sem contato após (dias)")}
        {field("inactiveClientDays", "Cliente inativo após (dias)", "Afeta a saúde do relacionamento")}
        {field("largeDealThreshold", "Limite de aprovação de propostas (R$)", "Acima disso, o envio exige aprovação")}
        {field("proposalValidityDays", "Validade padrão de propostas (dias)")}
        {field("defaultWeeklyCapacity", "Capacidade semanal padrão (h)")}
        {field("contractAlertDays", "Alertas de vencimento de contrato (dias)", "Ex.: 90, 60, 30, 7")}
        {field("taxes", "Impostos das propostas", "NOME:ALÍQUOTA, ex.: ISS:5, PIS:0,65")}
        {field("departments", "Departamentos", "Separados por vírgula")}
        {field("industries", "Segmentos de clientes", "Separados por vírgula")}
      </fieldset>
    </FormCard>
  );
}

export function AiToggle({ enabled, canEdit }: { enabled: boolean; canEdit: boolean }) {
  const [on, setOn] = React.useState(enabled);
  const { run, pending } = useAction(updateOrgSettingsAction, { success: "Preferência de IA salva" });
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4">
      <span>
        <span className="block text-sm font-medium">Córtex AI habilitado para a empresa</span>
        <span className="block text-[13px] text-muted-foreground">Quando desligado, nenhum dado é enviado ao provedor de IA. Consultas diretas e cálculos continuam funcionando.</span>
      </span>
      <Switch checked={on} disabled={!canEdit || pending} onCheckedChange={(c: boolean) => { setOn(c); void run({ aiEnabled: c }); }} aria-label="Habilitar Córtex AI" />
    </label>
  );
}

export function DeletionPanel({ orgName, requestedAt, scheduledFor }: { orgName: string; requestedAt: string | null; scheduledFor: string | null }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const req = useAction(requestOrgDeletionAction, { success: "Exclusão agendada", onSuccess: () => router.refresh() });
  const cancel = useAction(cancelOrgDeletionAction, { success: "Exclusão cancelada" });
  if (requestedAt) {
    return (
      <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
        <p className="text-sm font-medium text-destructive">Exclusão da conta agendada para {scheduledFor ? new Date(scheduledFor).toLocaleDateString("pt-BR") : "—"}.</p>
        <p className="text-[13px] text-muted-foreground">Até lá o workspace fica em modo somente leitura. Após a data, os dados da empresa são removidos definitivamente pela rotina de retenção.</p>
        <Button size="sm" variant="outline" loading={cancel.pending} onClick={() => cancel.run({})}>Cancelar exclusão</Button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-5">
      <h2 className="text-sm font-semibold text-destructive">Excluir conta da empresa</h2>
      <p className="text-[13px] text-muted-foreground">Agenda a exclusão definitiva de todos os dados do workspace após o período de carência. Exporte seus dados antes. Digite <b>{orgName}</b> para confirmar.</p>
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome da empresa" placeholder={orgName} />
      <ConfirmDialog title="Agendar exclusão da conta?" description="O workspace ficará somente leitura até a exclusão definitiva." confirmLabel="Agendar exclusão" destructive trigger={<Button size="sm" variant="destructive" disabled={name.trim() !== orgName}>Solicitar exclusão</Button>} onConfirm={() => req.run({ confirmName: name })} />
    </div>
  );
}

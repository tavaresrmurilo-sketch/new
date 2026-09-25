"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { fmt } from "@/lib/format";
import { MONTHS_PT } from "@/lib/periods";
import { PLANS } from "@/lib/plans";
import { accountLabels } from "@/lib/account-labels";

const ROLE_LABELS: Record<string, string> = { ADMIN_CLIENTE: "Administrador", DIRETOR: "Diretor", FINANCEIRO: "Financeiro", COMERCIAL: "Comercial", ANALISTA: "Analista", VIEWER: "Visualizador" };
const DRE_GROUPS: Record<string, string> = {
  GROSS_REVENUE: "Receita bruta", DEDUCTIONS: "Deduções", COGS: "Custos", OPERATING_EXPENSES: "Despesas operacionais", DEPRECIATION: "Depreciação/amortização",
  FINANCIAL_INCOME: "Receitas financeiras", FINANCIAL_EXPENSES: "Despesas financeiras", NON_OPERATING: "Não operacional", INCOME_TAXES: "IR/CSLL",
};

interface Company {
  name: string;
  cnpj: string;
  logoUrl: string;
  segment: string;
  currency: string;
  timezone: string;
  fiscalYearStartMonth: number;
  revenueGoalMonthly: number | null;
  marginGoalPct: number | null;
  minCashBalance: number | null;
}
interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
}
interface ChartRow {
  id: string;
  code: string;
  name: string;
  dreGroup: string;
  categoryAliases: string[];
  isSensitive: boolean;
}

export function SettingsTabs(props: {
  currentUserId: string;
  personal: boolean;
  can: { users: boolean; privacy: boolean };
  company: Company;
  users: UserRow[];
  chart: ChartRow[];
  privacy: { dataRetentionDays: number; aiProviderConsent: boolean; allowExternalAiTraining: boolean; aiProvider: string };
  grants: { id: string; reason: string; expiresAt: string; revokedAt: string | null; createdAt: string }[];
  plan: { plan: keyof typeof PLANS; status: string; provider: string; periodEnd: string | null; users: number; aiQuestions30d: number };
}) {
  const labels = accountLabels(props.personal ? "PERSONAL" : "BUSINESS");
  return (
    <Tabs defaultValue="empresa">
      <TabsList className="flex-wrap">
        <TabsTrigger value="empresa">{labels.profileTab}</TabsTrigger>
        {props.can.users && !props.personal ? <TabsTrigger value="usuarios">Usuários e permissões</TabsTrigger> : null}
        <TabsTrigger value="plano-contas">Plano de contas</TabsTrigger>
        {props.can.privacy ? <TabsTrigger value="privacidade">Privacidade (LGPD)</TabsTrigger> : null}
        <TabsTrigger value="suporte">Suporte JR</TabsTrigger>
        <TabsTrigger value="plano">Plano</TabsTrigger>
      </TabsList>
      <TabsContent value="empresa">
        <CompanyForm initial={props.company} personal={props.personal} />
      </TabsContent>
      {props.can.users ? (
        <TabsContent value="usuarios">
          <UsersPanel users={props.users} currentUserId={props.currentUserId} />
        </TabsContent>
      ) : null}
      <TabsContent value="plano-contas">
        <ChartPanel rows={props.chart} />
      </TabsContent>
      {props.can.privacy ? (
        <TabsContent value="privacidade">
          <PrivacyPanel initial={props.privacy} companyName={props.company.name} personal={props.personal} />
        </TabsContent>
      ) : null}
      <TabsContent value="suporte">
        <SupportPanel grants={props.grants} />
      </TabsContent>
      <TabsContent value="plano">
        <PlanPanel plan={props.plan} />
      </TabsContent>
    </Tabs>
  );
}

function CompanyForm({ initial, personal }: { initial: Company; personal: boolean }) {
  const labels = accountLabels(personal ? "PERSONAL" : "BUSINESS");
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [saving, setSaving] = useState(false);
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));
  async function save() {
    setSaving(true);
    try {
      await api("/api/settings/company", { method: "PATCH", json: { ...c, cnpj: c.cnpj || null, logoUrl: c.logoUrl || null, segment: c.segment || null } });
      toast.success(personal ? "Perfil atualizado." : "Dados da empresa atualizados.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.profileTitle}</CardTitle>
        <CardDescription>Metas e caixa mínimo alimentam insights, alertas e o fluxo de caixa.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label={labels.nameLabel}><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        {!personal ? (
          <>
            <Field label="CNPJ (opcional)"><Input value={c.cnpj} onChange={(e) => setC({ ...c, cnpj: e.target.value })} /></Field>
            <Field label="Logo (URL https)"><Input value={c.logoUrl} onChange={(e) => setC({ ...c, logoUrl: e.target.value })} placeholder="https://..." /></Field>
            <Field label="Segmento"><Input value={c.segment} onChange={(e) => setC({ ...c, segment: e.target.value })} /></Field>
          </>
        ) : null}
        <Field label="Moeda">
          <Select value={c.currency} onChange={(e) => setC({ ...c, currency: e.target.value })}>
            <option value="BRL">Real (BRL)</option>
            <option value="USD">Dólar (USD)</option>
            <option value="EUR">Euro (EUR)</option>
          </Select>
        </Field>
        <Field label="Timezone">
          <Select value={c.timezone} onChange={(e) => setC({ ...c, timezone: e.target.value })}>
            {["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Recife", "America/Fortaleza", "America/Belem", "America/Rio_Branco", "America/Noronha"].map((tz) => (
              <option key={tz}>{tz}</option>
            ))}
          </Select>
        </Field>
        <Field label="Início do exercício fiscal">
          <Select value={c.fiscalYearStartMonth} onChange={(e) => setC({ ...c, fiscalYearStartMonth: Number(e.target.value) })}>
            {MONTHS_PT.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Meta de faturamento mensal (R$)"><Input inputMode="decimal" defaultValue={c.revenueGoalMonthly ?? ""} onChange={(e) => setC({ ...c, revenueGoalMonthly: num(e.target.value) })} /></Field>
        <Field label="Meta de margem líquida (%)"><Input inputMode="decimal" defaultValue={c.marginGoalPct ?? ""} onChange={(e) => setC({ ...c, marginGoalPct: num(e.target.value) })} /></Field>
        <Field label="Caixa mínimo desejado (R$)"><Input inputMode="decimal" defaultValue={c.minCashBalance ?? ""} onChange={(e) => setC({ ...c, minCashBalance: num(e.target.value) })} /></Field>
        <div className="flex items-end">
          <Button onClick={save} disabled={saving}>
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UsersPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "ANALISTA", password: "" });
  async function create() {
    await api("/api/settings/users", { method: "POST", json: form });
    toast.success("Usuário criado. Compartilhe a senha temporária por um canal seguro.");
    setOpen(false);
    setForm({ name: "", email: "", role: "ANALISTA", password: "" });
    router.refresh();
  }
  const update = async (id: string, body: Record<string, unknown>) => {
    await api(`/api/settings/users/${id}`, { method: "PATCH", json: body });
    router.refresh();
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>Permissões por módulo seguem o papel (RBAC). Ex.: Comercial não acessa DRE nem folha salarial.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Adicionar usuário
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Nome</TH>
              <TH>E-mail</TH>
              <TH>Papel</TH>
              <TH>Último acesso</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.name}</TD>
                <TD>{u.email}</TD>
                <TD>
                  <Select value={u.role} disabled={u.id === currentUserId} onChange={(e) => update(u.id, { role: e.target.value })} className="h-8 w-40">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </TD>
                <TD>{fmt.dateTime(u.lastLoginAt)}</TD>
                <TD>{u.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TD>
                <TD className="text-right">
                  {u.id !== currentUserId ? (
                    <Button variant="ghost" size="sm" onClick={() => update(u.id, { active: !u.active })}>
                      {u.active ? "Desativar" : "Reativar"}
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar usuário</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Papel">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Senha temporária" hint="Mínimo de 10 caracteres com letras e números."><Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button onClick={create}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ChartPanel({ rows }: { rows: ChartRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<ChartRow> | null>(null);
  async function save() {
    if (!editing) return;
    const body = { code: editing.code, name: editing.name, dreGroup: editing.dreGroup ?? "OPERATING_EXPENSES", categoryAliases: editing.categoryAliases ?? [], isSensitive: editing.isSensitive ?? false };
    if (editing.id) await api(`/api/settings/chart/${editing.id}`, { method: "PATCH", json: body });
    else await api("/api/settings/chart", { method: "POST", json: body });
    toast.success("Plano de contas atualizado.");
    setEditing(null);
    router.refresh();
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Plano de contas</CardTitle>
          <CardDescription>Mapeia as categorias dos seus sistemas para as linhas do DRE. Categorias sem conta usam regras padrão e são sinalizadas no DRE.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing({ dreGroup: "OPERATING_EXPENSES", categoryAliases: [] })}>
          <Plus /> Nova conta
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Código</TH>
              <TH>Conta</TH>
              <TH>Grupo do DRE</TH>
              <TH>Categorias vinculadas</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.code}</TD>
                <TD className="font-medium">
                  {r.name} {r.isSensitive ? <Badge variant="warning">Sensível</Badge> : null}
                </TD>
                <TD>{DRE_GROUPS[r.dreGroup]}</TD>
                <TD className="max-w-md text-xs text-muted-foreground">{r.categoryAliases.join(", ") || "—"}</TD>
                <TD className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label="Editar">
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Excluir"
                    onClick={async () => {
                      if (!window.confirm("Excluir esta conta?")) return;
                      await api(`/api/settings/chart/${r.id}`, { method: "DELETE" });
                      router.refresh();
                    }}
                  >
                    <Trash2 />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar conta" : "Nova conta"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Código"><Input value={editing?.code ?? ""} onChange={(e) => setEditing((x) => ({ ...x, code: e.target.value }))} /></Field>
              <Field label="Nome" className="col-span-2"><Input value={editing?.name ?? ""} onChange={(e) => setEditing((x) => ({ ...x, name: e.target.value }))} /></Field>
            </div>
            <Field label="Grupo do DRE">
              <Select value={editing?.dreGroup ?? "OPERATING_EXPENSES"} onChange={(e) => setEditing((x) => ({ ...x, dreGroup: e.target.value }))}>
                {Object.entries(DRE_GROUPS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Categorias vinculadas (separadas por vírgula)"><Input value={(editing?.categoryAliases ?? []).join(", ")} onChange={(e) => setEditing((x) => ({ ...x, categoryAliases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing?.isSensitive ?? false} onChange={(e) => setEditing((x) => ({ ...x, isSensitive: e.target.checked }))} /> Dado sensível (ex.: folha salarial — visível apenas com permissão específica)
            </label>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={!editing?.code || !editing?.name}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PrivacyPanel({ initial, companyName, personal }: { initial: { dataRetentionDays: number; aiProviderConsent: boolean; allowExternalAiTraining: boolean; aiProvider: string }; companyName: string; personal: boolean }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [confirm, setConfirm] = useState("");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Controle de dados</CardTitle>
          <CardDescription>Minimização, retenção e uso de IA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Field label="Política de retenção (dias)" hint="A rotina diária remove conversas, arquivos importados e histórico de relatórios mais antigos que este prazo. Dados financeiros só são excluídos por ação explícita.">
            <Input type="number" min={90} max={3650} value={p.dataRetentionDays} onChange={(e) => setP({ ...p, dataRetentionDays: Number(e.target.value) })} />
          </Field>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={p.aiProviderConsent} onChange={(e) => setP({ ...p, aiProviderConsent: e.target.checked })} />
            <span>
              Autorizo o envio de <strong>fatos agregados mínimos</strong> (nunca a base bruta) ao provedor de IA configurado para redação das respostas.
              <span className="block text-xs text-muted-foreground">Provedor atual: {p.aiProvider}. Sem autorização, o Cortex usa apenas o motor interno determinístico.</span>
            </span>
          </label>
          <Notice>Treinamento de modelos externos com seus dados: <strong>desabilitado</strong>. Os dados nunca são usados para treinamento sem autorização explícita e contratual.</Notice>
          <Button
            onClick={async () => {
              await api("/api/settings/privacy", { method: "PATCH", json: { dataRetentionDays: p.dataRetentionDays, aiProviderConsent: p.aiProviderConsent } });
              toast.success("Preferências de privacidade salvas.");
              router.refresh();
            }}
          >
            Salvar
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Direitos do titular (LGPD)</CardTitle>
          <CardDescription>Exportação e exclusão de dados — todas as ações são auditadas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-medium">Exportar dados</p>
            <p className="text-muted-foreground">Arquivo JSON com todos os seus dados no Cortex (credenciais não são exportadas).</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <a href="/api/privacy/export">Exportar dados (JSON)</a>
            </Button>
          </div>
          <div className="rounded-md border border-critical/30 p-3">
            <p className="font-medium text-critical">{personal ? "Excluir meus dados" : "Excluir dados empresariais"}</p>
            <p className="text-muted-foreground">Remove vendas, financeiro, cadastros, importações, conversas e relatórios. Usuários, configurações e auditoria são preservados. Ação irreversível.</p>
            <Input className="mt-2" placeholder={`Digite "${companyName}" para confirmar`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              disabled={confirm !== companyName}
              onClick={async () => {
                await api("/api/privacy/delete", { method: "POST", json: { confirm } });
                toast.success("Dados excluídos.");
                setConfirm("");
                router.refresh();
              }}
            >
              Excluir definitivamente
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SupportPanel({ grants }: { grants: { id: string; reason: string; expiresAt: string; revokedAt: string | null; createdAt: string }[] }) {
  const router = useRouter();
  const [hours, setHours] = useState(4);
  const [reason, setReason] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Acesso de suporte JR Consultorias</CardTitle>
        <CardDescription>Administradores da JR não visualizam seus dados sem autorização explícita e temporária. O acesso é somente leitura e auditado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
          <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: apoio na configuração do plano de contas" /></Field>
          <Field label="Duração (horas)"><Input type="number" min={1} max={72} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></Field>
          <div className="flex items-end">
            <Button
              disabled={reason.trim().length < 5}
              onClick={async () => {
                await api("/api/support-grants", { method: "POST", json: { hours, reason } });
                toast.success("Acesso de suporte autorizado.");
                setReason("");
                router.refresh();
              }}
            >
              Autorizar
            </Button>
          </div>
        </div>
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Autorizado em</TH>
              <TH>Motivo</TH>
              <TH>Expira</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {grants.map((g) => {
              const active = !g.revokedAt && new Date(g.expiresAt) > new Date();
              return (
                <TR key={g.id}>
                  <TD>{fmt.dateTime(g.createdAt)}</TD>
                  <TD>{g.reason}</TD>
                  <TD>{fmt.dateTime(g.expiresAt)}</TD>
                  <TD>{active ? <Badge variant="warning">Ativo</Badge> : <Badge variant="secondary">{g.revokedAt ? "Revogado" : "Expirado"}</Badge>}</TD>
                  <TD className="text-right">
                    {active ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await api(`/api/support-grants/${g.id}`, { method: "DELETE" });
                          router.refresh();
                        }}
                      >
                        Revogar
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PlanPanel({ plan }: { plan: { plan: keyof typeof PLANS; status: string; provider: string; periodEnd: string | null; users: number; aiQuestions30d: number } }) {
  const p = PLANS[plan.plan];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Plano atual: {p.label}</CardTitle>
          <CardDescription>
            Status: {plan.status} · Cobrança: {plan.provider === "NONE" ? "não configurada (Stripe, Mercado Pago e Asaas preparados)" : plan.provider}
            {plan.periodEnd ? ` · até ${fmt.date(plan.periodEnd)}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <p>Usuários: <strong>{plan.users}</strong> de {p.users}</p>
          <p>Perguntas ao Cortex (30 dias, com IA externa): <strong>{plan.aiQuestions30d}</strong> de {p.aiQuestionsMonth.toLocaleString("pt-BR")}</p>
          <p>Histórico: até {p.historyMonths} meses</p>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((k) => (
          <Card key={k} className={k === plan.plan ? "border-primary" : undefined}>
            <CardHeader>
              <CardTitle>{PLANS[k].label}</CardTitle>
              <CardDescription>{PLANS[k].priceBRL ? `${fmt.money(PLANS[k].priceBRL)}/mês` : "Sob consulta"}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <ul className="list-disc space-y-0.5 pl-4">
                {PLANS[k].features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
                <li>{PLANS[k].users} usuários · {PLANS[k].integrations} integrações</li>
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

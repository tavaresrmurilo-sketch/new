"use client";

import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { FieldDefLite } from "@/components/integrations/connect-wizard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { api } from "@/lib/api-client";

interface Column {
  name: string;
  type: string;
  kind: string;
}

export interface TableView {
  id: string;
  schemaName: string;
  tableName: string;
  enabled: boolean;
  entity: string | null;
  mapping: Record<string, string | null>;
  columns: Column[];
  incrementalColumn: string | null;
}

/** "Configurar": edita a conexão. Campos secretos em branco mantêm o valor salvo (que nunca é enviado ao navegador). */
export function ConnectionEditor({ id, provider, config }: { id: string; provider: string; config: Record<string, unknown> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState<Record<string, string | boolean>>(() => ({
    host: String(config.host ?? ""),
    port: String(config.port ?? ""),
    database: String(config.database ?? ""),
    username: String(config.username ?? ""),
    password: "",
    ssl: Boolean(config.ssl),
    encrypt: config.encrypt !== false,
    trustServerCertificate: Boolean(config.trustServerCertificate),
    baseUrl: String(config.baseUrl ?? ""),
    authType: String(config.authType ?? "NONE"),
    apiKeyHeader: String(config.apiKeyHeader ?? "X-API-Key"),
    apiKey: "",
    token: "",
  }));
  const set = (k: string, val: string | boolean) => setV((o) => ({ ...o, [k]: val }));
  const isRest = provider === "rest-api";

  async function save() {
    setBusy(true);
    try {
      const connection = isRest
        ? { baseUrl: v.baseUrl, authType: v.authType, apiKeyHeader: v.apiKeyHeader, apiKey: v.apiKey, token: v.token, username: v.username || undefined, password: v.password }
        : { host: v.host, port: Number(v.port) || undefined, database: v.database, username: v.username, password: v.password, ssl: v.ssl, encrypt: v.encrypt, trustServerCertificate: v.trustServerCertificate };
      await api(`/api/integrations/${id}`, { method: "PATCH", json: { connection } });
      toast.success("Conexão testada e atualizada.");
      setOpen(false);
      router.refresh();
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil /> Configurar conexão
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar conexão</DialogTitle>
          <DialogDescription>A conexão é testada antes de salvar. Deixe senha/token em branco para manter o valor atual.</DialogDescription>
        </DialogHeader>
        {isRest ? (
          <div className="grid gap-3">
            <Field label="Base URL">
              <Input value={String(v.baseUrl)} onChange={(e) => set("baseUrl", e.target.value)} />
            </Field>
            <Field label="Autenticação">
              <Select value={String(v.authType)} onChange={(e) => set("authType", e.target.value)}>
                <option value="NONE">Nenhuma</option>
                <option value="API_KEY">API Key</option>
                <option value="BEARER_TOKEN">Bearer Token</option>
                <option value="BASIC_AUTH">Basic Auth</option>
              </Select>
            </Field>
            {v.authType === "API_KEY" ? (
              <>
                <Field label="Header da chave">
                  <Input value={String(v.apiKeyHeader)} onChange={(e) => set("apiKeyHeader", e.target.value)} />
                </Field>
                <Field label="API Key">
                  <Input type="password" autoComplete="off" placeholder="••••••••••••" value={String(v.apiKey)} onChange={(e) => set("apiKey", e.target.value)} />
                </Field>
              </>
            ) : null}
            {v.authType === "BEARER_TOKEN" ? (
              <Field label="Token">
                <Input type="password" autoComplete="off" placeholder="••••••••••••" value={String(v.token)} onChange={(e) => set("token", e.target.value)} />
              </Field>
            ) : null}
            {v.authType === "BASIC_AUTH" ? (
              <>
                <Field label="Usuário">
                  <Input value={String(v.username)} onChange={(e) => set("username", e.target.value)} />
                </Field>
                <Field label="Senha">
                  <Input type="password" autoComplete="new-password" placeholder="••••••••••••" value={String(v.password)} onChange={(e) => set("password", e.target.value)} />
                </Field>
              </>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="Host" className="sm:col-span-4">
              <Input value={String(v.host)} onChange={(e) => set("host", e.target.value)} />
            </Field>
            <Field label="Porta" className="sm:col-span-2">
              <Input value={String(v.port)} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Database" className="sm:col-span-3">
              <Input value={String(v.database)} onChange={(e) => set("database", e.target.value)} />
            </Field>
            <Field label="Usuário" className="sm:col-span-3">
              <Input value={String(v.username)} onChange={(e) => set("username", e.target.value)} />
            </Field>
            <Field label="Senha" className="sm:col-span-6">
              <Input type="password" autoComplete="new-password" placeholder="••••••••••••  (em branco = manter)" value={String(v.password)} onChange={(e) => set("password", e.target.value)} />
            </Field>
            {provider === "sqlserver" ? (
              <div className="flex gap-4 text-sm sm:col-span-6">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(v.encrypt)} onChange={(e) => set("encrypt", e.target.checked)} /> Encrypt
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(v.trustServerCertificate)} onChange={(e) => set("trustServerCertificate", e.target.checked)} /> Trust Server Certificate
                </label>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm sm:col-span-6">
                <input type="checkbox" checked={Boolean(v.ssl)} onChange={(e) => set("ssl", e.target.checked)} /> Usar SSL/TLS
              </label>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Testar e salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleSelect({ id, value, disabled }: { id: string; value: number | null; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Select
      value={value ? String(value) : ""}
      disabled={busy || disabled}
      className="h-8 w-44"
      onChange={async (e) => {
        setBusy(true);
        try {
          await api(`/api/integrations/${id}`, { method: "PATCH", json: { syncIntervalMinutes: e.target.value ? Number(e.target.value) : null } });
          toast.success("Agendamento atualizado.");
          router.refresh();
        } catch {
          /* toast já exibido */
        } finally {
          setBusy(false);
        }
      }}
    >
      <option value="">Manual</option>
      <option value="60">A cada hora</option>
      <option value="360">A cada 6 horas</option>
      <option value="1440">Diariamente</option>
    </Select>
  );
}

/** Edita tipo de dado, mapeamento de campos e coluna incremental de uma tabela/endpoint. */
export function TableEditor({ integrationId, table, fields, entityLabels }: { integrationId: string; table: TableView; fields: Record<string, FieldDefLite[]>; entityLabels: Record<string, string> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entity, setEntity] = useState<string | null>(table.entity);
  const [mapping, setMapping] = useState<Record<string, string | null>>(table.mapping);
  const [inc, setInc] = useState<string | null>(table.incrementalColumn);
  const [enabled, setEnabled] = useState(table.enabled);
  const missing = entity ? (fields[entity] ?? []).filter((f) => f.required && !mapping[f.key]) : [];

  async function save() {
    setBusy(true);
    try {
      const clean = entity ? Object.fromEntries(Object.entries(mapping).filter(([k]) => (fields[entity] ?? []).some((f) => f.key === k))) : {};
      await api(`/api/integrations/${integrationId}/tables/${table.id}`, { method: "PATCH", json: { entity, mapping: clean, incrementalColumn: inc, enabled } });
      toast.success("Mapeamento salvo. A próxima sincronização relerá esta tabela.");
      setOpen(false);
      router.refresh();
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Pencil /> Mapear
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{table.schemaName && !table.tableName.startsWith("/") ? `${table.schemaName}.${table.tableName}` : table.tableName}</DialogTitle>
          <DialogDescription>{table.columns.length} colunas conhecidas. Somente colunas existentes na fonte podem ser usadas.</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Sincronizar esta tabela
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de dado no Cortex">
            <Select value={entity ?? ""} onChange={(e) => setEntity(e.target.value || null)}>
              <option value="">Selecione...</option>
              {Object.entries(entityLabels).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Coluna incremental">
            <Select value={inc ?? ""} onChange={(e) => setInc(e.target.value || null)}>
              <option value="">Nenhuma (leitura completa)</option>
              {table.columns
                .filter((c) => c.kind === "date" || c.kind === "number" || c.kind === "other")
                .map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        {entity ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {(fields[entity] ?? []).map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || null }))}>
                  <option value="">— não mapear —</option>
                  {table.columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} · {c.type}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        ) : null}
        {enabled && missing.length ? <Notice tone="warning">Mapeie os campos obrigatórios: {missing.map((f) => f.label).join(", ")}.</Notice> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={busy || (enabled && (!entity || missing.length > 0))}>
            {busy ? <Loader2 className="animate-spin" /> : null} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DiscoveredColumns {
  schema: string;
  name: string;
  columns: Column[];
  suggestedEntity: string | null;
  suggestedMapping: Record<string, string | null>;
  suggestedIncremental: string | null;
}

/** Adiciona novas tabelas (ou endpoints) à integração. Tabelas sem mapeamento completo entram desativadas. */
export function AddTables({ id, provider, existing, fields }: { id: string; provider: string; existing: string[]; fields: Record<string, FieldDefLite[]> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tables, setTables] = useState<{ schema: string; name: string; type?: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [endpoint, setEndpoint] = useState({ path: "", dataPath: "" });
  const isRest = provider === "rest-api";
  const key = (t: { schema: string; name: string }) => `${t.schema}|${t.name}`;

  async function load() {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; message: string; reason?: string; tables: { schema: string; name: string; type?: string }[] }>(`/api/integrations/${id}/discover`);
      if (!r.ok) toast.error(r.message, { description: r.reason });
      setTables(r.tables.filter((t) => !existing.includes(key(t))));
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const selected = isRest ? [{ schema: endpoint.dataPath, name: endpoint.path }] : (tables ?? []).filter((t) => picked.has(key(t))).map((t) => ({ schema: t.schema, name: t.name }));
    const endpoints = isRest ? [{ path: endpoint.path, dataPath: endpoint.dataPath }] : [];
    if (!selected.length) return;
    setBusy(true);
    try {
      const r = await api<{ tables: DiscoveredColumns[] }>(`/api/integrations/${id}/tables`, { method: "POST", json: { action: "columns", tables: selected, endpoints } });
      const selections = r.tables.map((t) => {
        const complete = Boolean(t.suggestedEntity) && (fields[t.suggestedEntity!] ?? []).every((f) => !f.required || t.suggestedMapping[f.key]);
        return { schema: t.schema, name: t.name, entity: t.suggestedEntity, mapping: t.suggestedMapping, incrementalColumn: t.suggestedIncremental, enabled: complete };
      });
      await api(`/api/integrations/${id}/tables`, { method: "POST", json: { action: "add", tables: selections, endpoints } });
      const pending = selections.filter((s) => !s.enabled).length;
      toast.success(pending ? `${selections.length} adicionada(s). ${pending} precisa(m) de mapeamento antes de sincronizar.` : `${selections.length} adicionada(s).`);
      setOpen(false);
      setPicked(new Set());
      router.refresh();
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !isRest && !tables) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> {isRest ? "Adicionar endpoint" : "Adicionar tabelas"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRest ? "Adicionar endpoint" : "Adicionar tabelas"}</DialogTitle>
          <DialogDescription>O mapeamento é sugerido automaticamente; revise em &quot;Mapear&quot; depois.</DialogDescription>
        </DialogHeader>
        {isRest ? (
          <div className="grid grid-cols-[1fr_9rem] gap-2">
            <Input placeholder="/orders" value={endpoint.path} onChange={(e) => setEndpoint((x) => ({ ...x, path: e.target.value }))} />
            <Input placeholder="lista em (opcional)" value={endpoint.dataPath} onChange={(e) => setEndpoint((x) => ({ ...x, dataPath: e.target.value }))} />
          </div>
        ) : busy && !tables ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Lendo tabelas da fonte...
          </p>
        ) : (
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {(tables ?? []).map((t) => (
              <label key={key(t)} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                <input
                  type="checkbox"
                  checked={picked.has(key(t))}
                  onChange={(e) =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(key(t));
                      else n.delete(key(t));
                      return n;
                    })
                  }
                />
                <span className="font-mono text-xs">{t.schema ? `${t.schema}.${t.name}` : t.name}</span>
              </label>
            ))}
            {tables && !tables.length ? <p className="text-sm text-muted-foreground">Nenhuma tabela nova disponível.</p> : null}
          </div>
        )}
        <DialogFooter>
          <Button onClick={add} disabled={busy || (isRest ? !endpoint.path.startsWith("/") : !picked.size)}>
            {busy && tables ? <Loader2 className="animate-spin" /> : null} Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

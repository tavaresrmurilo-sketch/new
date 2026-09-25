"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Database, FileSpreadsheet, FileText, Globe, Loader2, Lock, Plus, Search, ShieldCheck, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export type Kind = "postgresql" | "mysql" | "sqlserver" | "rest-api";

export interface FieldDefLite {
  key: string;
  label: string;
  required: boolean;
  kind: string;
}

interface Column {
  name: string;
  type: string;
  kind: string;
}

interface DiscoveredTable {
  schema: string;
  name: string;
  type?: string;
}

interface DiscoveredColumns extends DiscoveredTable {
  columns: Column[];
  suggestedEntity: string | null;
  suggestedMapping: Record<string, string | null>;
  suggestedIncremental: string | null;
}

interface TestResult {
  ok: boolean;
  message: string;
  reason?: string;
  causes?: string[];
  durationMs: number;
  tables: DiscoveredTable[];
  endpoints?: { path: string; status: number; ms: number; items: number }[];
}

interface Selection {
  entity: string | null;
  mapping: Record<string, string | null>;
  incrementalColumn: string | null;
  enabled: boolean;
}

export const STEPS = ["Escolha a fonte", "Configure a conexão", "Testar conexão", "Selecionar dados", "Mapear campos", "Definir sincronização", "Concluir"];

export const SOURCES: { kind: Kind; label: string; description: string }[] = [
  { kind: "postgresql", label: "PostgreSQL", description: "Banco PostgreSQL (inclui Neon, Supabase, RDS, Azure)." },
  { kind: "mysql", label: "MySQL", description: "MySQL ou MariaDB (inclui RDS, Cloud SQL, PlanetScale)." },
  { kind: "sqlserver", label: "SQL Server", description: "Microsoft SQL Server ou Azure SQL (ERPs como TOTVS, Sankhya)." },
  { kind: "rest-api", label: "API REST", description: "Qualquer sistema com API REST/JSON via HTTPS (somente GET)." },
];

const DEFAULT_PORT: Record<string, string> = { postgresql: "5432", mysql: "3306", sqlserver: "1433" };
const CS_PLACEHOLDER: Record<string, string> = {
  postgresql: "postgresql://usuario:senha@host:5432/banco?sslmode=require",
  mysql: "mysql://usuario:senha@host:3306/banco",
  sqlserver: "Server=host,1433;Database=banco;User Id=usuario;Password=senha;",
};

const READONLY_SQL: Record<string, string> = {
  postgresql: `CREATE USER jr_cortex_leitura WITH PASSWORD 'senha-forte';
GRANT CONNECT ON DATABASE seu_banco TO jr_cortex_leitura;
GRANT USAGE ON SCHEMA public TO jr_cortex_leitura;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO jr_cortex_leitura;`,
  mysql: `CREATE USER 'jr_cortex_leitura'@'%' IDENTIFIED BY 'senha-forte';
GRANT SELECT ON seu_banco.* TO 'jr_cortex_leitura'@'%';`,
  sqlserver: `CREATE LOGIN jr_cortex_leitura WITH PASSWORD = 'senha-forte';
USE seu_banco;
CREATE USER jr_cortex_leitura FOR LOGIN jr_cortex_leitura;
ALTER ROLE db_datareader ADD MEMBER jr_cortex_leitura;`,
};

export const INTERVALS: { value: number | null; label: string; hint: string }[] = [
  { value: null, label: "Manual", hint: "Somente quando você clicar em \"Sincronizar agora\"." },
  { value: 60, label: "A cada hora", hint: "Ideal para vendas e pedidos do dia." },
  { value: 360, label: "A cada 6 horas", hint: "Bom equilíbrio entre atualização e carga na fonte." },
  { value: 1440, label: "Diariamente", hint: "Recomendado para bancos de ERP com muito volume." },
];

const tkey = (t: { schema: string; name: string }) => `${t.schema}|${t.name}`;
const tlabel = (t: { schema: string; name: string }, kind: Kind) => (kind === "rest-api" ? t.name : t.schema ? `${t.schema}.${t.name}` : t.name);

export function StepProgress({ step }: { step: number }) {
  return (
    <ol className="mb-6 grid grid-cols-7 gap-1.5" aria-label="Progresso">
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0">
          <div className={cn("h-1.5 rounded-full", i < step ? "bg-primary" : i === step ? "bg-primary/60" : "bg-muted")} />
          <p className={cn("mt-1.5 hidden truncate text-[11px] sm:block", i === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {i + 1}. {s}
          </p>
        </li>
      ))}
      <li className="col-span-7 text-xs text-muted-foreground sm:hidden">
        Etapa {step + 1} de {STEPS.length}: <strong className="text-foreground">{STEPS[step]}</strong>
      </li>
    </ol>
  );
}

export function PrivateNetworkHelp() {
  return (
    <details className="rounded-lg border bg-muted/30 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Meu banco está em rede privada. O que fazer?</summary>
      <div className="mt-2 space-y-1.5 text-muted-foreground">
        <p>O JR Cortex acessa sua fonte pela internet, a partir da nuvem. Bancos em rede interna não são alcançáveis diretamente. Opções seguras:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Liberar o IP</strong> de saída do JR Cortex no firewall, apenas na porta do banco, com SSL obrigatório.</li>
          <li><strong>VPN / túnel seguro</strong> (ex.: túnel gerenciado pela sua equipe de TI) expondo somente o banco, com usuário de leitura.</li>
          <li><strong>API intermediária</strong>: sua TI publica uma API HTTPS somente leitura e você conecta via &quot;API REST&quot;.</li>
          <li><strong>Réplica de leitura</strong> na nuvem, sincronizada a partir do banco principal.</li>
        </ul>
        <p>Nunca desative a autenticação ou exponha o banco sem firewall. Endereços internos (localhost, 10.x, 192.168.x) são bloqueados por segurança.</p>
      </div>
    </details>
  );
}

function ErrorBox({ result }: { result: { message: string; reason?: string; causes?: string[] } }) {
  return (
    <div className="rounded-lg border border-critical/30 bg-critical/5 p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold text-critical">
        <XCircle className="size-4" /> {result.message}
      </p>
      {result.reason ? <p className="mt-1">{result.reason}</p> : null}
      {result.causes?.length ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase text-muted-foreground">Possíveis causas</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {result.causes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function ConnectWizard({ fields, entityLabels, initialKind }: { fields: Record<string, FieldDefLite[]>; entityLabels: Record<string, string>; initialKind?: Kind }) {
  const router = useRouter();
  const [step, setStep] = useState(initialKind ? 1 : 0);
  const [kind, setKind] = useState<Kind>(initialKind ?? "postgresql");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  // conexão SQL
  const [useCs, setUseCs] = useState(false);
  const [cs, setCs] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORT[initialKind ?? "postgresql"] ?? "");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(true);
  const [encrypt, setEncrypt] = useState(true);
  const [trustCert, setTrustCert] = useState(false);

  // conexão REST
  const [baseUrl, setBaseUrl] = useState("");
  const [authType, setAuthType] = useState("NONE");
  const [apiKeyHeader, setApiKeyHeader] = useState("X-API-Key");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const [headers, setHeaders] = useState<{ name: string; value: string }[]>([]);
  const [endpoints, setEndpoints] = useState<{ path: string; dataPath: string }[]>([{ path: "/customers", dataPath: "" }]);

  const [test, setTest] = useState<TestResult | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [discovered, setDiscovered] = useState<DiscoveredColumns[]>([]);
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [interval, setInterval] = useState<number | null>(1440);

  const isSql = kind !== "rest-api";
  const sourceLabel = SOURCES.find((s) => s.kind === kind)?.label ?? kind;

  function source() {
    if (kind === "rest-api") {
      return {
        kind,
        connection: {
          baseUrl: baseUrl.trim(),
          authType,
          apiKeyHeader,
          apiKey: authType === "API_KEY" ? apiKey : undefined,
          token: authType === "BEARER_TOKEN" ? token : undefined,
          username: authType === "BASIC_AUTH" ? username : undefined,
          password: authType === "BASIC_AUTH" ? password : undefined,
          headers: headers.filter((h) => h.name.trim()),
        },
        endpoints: endpoints.filter((e) => e.path.trim()),
      };
    }
    const base = { ssl, sslRejectUnauthorized: true, encrypt, trustServerCertificate: trustCert };
    return { kind, connection: useCs ? { ...base, connectionString: cs.trim() } : { ...base, host: host.trim(), port: port ? Number(port) : undefined, database: database.trim(), username: username.trim(), password } };
  }

  function chooseKind(k: Kind) {
    setKind(k);
    setPort(DEFAULT_PORT[k] ?? "");
    setTest(null);
    setSelected(new Set());
    setDiscovered([]);
    setStep(1);
  }

  function connectionError(): string | null {
    if (kind === "rest-api") {
      if (!/^https?:\/\//.test(baseUrl.trim())) return "Informe a Base URL (https://...).";
      if (!endpoints.some((e) => e.path.trim().startsWith("/"))) return "Informe ao menos um endpoint começando com /.";
      if (authType === "API_KEY" && !apiKey) return "Informe a API Key.";
      if (authType === "BEARER_TOKEN" && !token) return "Informe o token.";
      if (authType === "BASIC_AUTH" && !username) return "Informe o usuário.";
      return null;
    }
    if (useCs) return cs.trim() ? null : "Informe a connection string.";
    if (!host.trim() || !database.trim() || !username.trim()) return "Preencha host, banco de dados e usuário.";
    return null;
  }

  async function runTest() {
    setBusy(true);
    setTest(null);
    try {
      const r = await api<TestResult>("/api/integrations/connections/test", { method: "POST", json: { source: source() } });
      setTest(r);
      if (r.ok) {
        toast.success(r.message);
        if (kind === "rest-api") setSelected(new Set(r.tables.map(tkey)));
      }
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  }

  async function loadColumns() {
    const tables = (test?.tables ?? []).filter((t) => selected.has(tkey(t))).map((t) => ({ schema: t.schema, name: t.name }));
    setBusy(true);
    try {
      const r = await api<{ tables: DiscoveredColumns[] }>("/api/integrations/connections/columns", { method: "POST", json: { source: source(), tables } });
      setDiscovered(r.tables);
      setSelections((prev) => {
        const next: Record<string, Selection> = {};
        for (const t of r.tables) {
          const k = tkey(t);
          next[k] = prev[k] ?? { entity: t.suggestedEntity, mapping: t.suggestedMapping, incrementalColumn: t.suggestedIncremental, enabled: true };
        }
        return next;
      });
      setStep(4);
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(false);
    }
  }

  function mappingErrors(): string[] {
    const errs: string[] = [];
    for (const t of discovered) {
      const s = selections[tkey(t)];
      if (!s?.enabled) continue;
      if (!s.entity) {
        errs.push(`${tlabel(t, kind)}: escolha o tipo de dado.`);
        continue;
      }
      for (const f of fields[s.entity] ?? []) if (f.required && !s.mapping[f.key]) errs.push(`${tlabel(t, kind)}: mapeie "${f.label}".`);
    }
    if (!discovered.some((t) => selections[tkey(t)]?.enabled)) errs.push("Habilite ao menos uma tabela.");
    return errs;
  }

  async function save() {
    setBusy(true);
    try {
      const tables = discovered.map((t) => {
        const s = selections[tkey(t)];
        return { schema: t.schema, name: t.name, entity: s.entity, mapping: s.entity ? Object.fromEntries(Object.entries(s.mapping).filter(([k]) => (fields[s.entity!] ?? []).some((f) => f.key === k))) : {}, incrementalColumn: s.incrementalColumn, enabled: s.enabled };
      });
      const r = await api<{ id: string }>("/api/integrations", { method: "POST", json: { name: name.trim() || `${sourceLabel} — ${isSql ? database || "banco" : baseUrl}`.slice(0, 80), source: source(), tables, syncIntervalMinutes: interval } });
      toast.success("Integração salva. Credenciais cifradas no Vault.");
      router.push(`/integracoes/${r.id}?nova=1`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setStep(2);
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const out = new Map<string, DiscoveredTable[]>();
    for (const t of test?.tables ?? []) {
      if (q && !`${t.schema}.${t.name}`.toLowerCase().includes(q)) continue;
      const g = out.get(t.schema) ?? [];
      g.push(t);
      out.set(t.schema, g);
    }
    return out;
  }, [test, filter]);

  const connErr = connectionError();
  const mapErrs = step >= 4 ? mappingErrors() : [];

  return (
    <div className="mx-auto max-w-4xl">
      <StepProgress step={step} />

      {step === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <button key={s.kind} type="button" onClick={() => chooseKind(s.kind)} className="rounded-xl border bg-card p-4 text-left transition hover:border-primary hover:shadow-sm">
              <div className="flex items-center gap-2 font-semibold">
                {s.kind === "rest-api" ? <Globe className="size-4 text-primary" /> : <Database className="size-4 text-primary" />} {s.label}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
            </button>
          ))}
          <Link href="/integracoes/importar?tipo=csv" className="rounded-xl border bg-card p-4 transition hover:border-primary hover:shadow-sm">
            <div className="flex items-center gap-2 font-semibold">
              <FileText className="size-4 text-primary" /> CSV
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Envie um arquivo CSV com mapeamento de colunas e validação.</p>
          </Link>
          <Link href="/integracoes/importar?tipo=excel" className="rounded-xl border bg-card p-4 transition hover:border-primary hover:shadow-sm">
            <div className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="size-4 text-primary" /> Excel
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Envie uma planilha .xlsx com prévia, tipos detectados e validação.</p>
          </Link>
        </div>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Configure a conexão — {sourceLabel}</CardTitle>
            <CardDescription>Credenciais são cifradas (AES-256-GCM) antes de serem gravadas e nunca voltam para o navegador.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Nome da integração">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`ex.: ERP ${sourceLabel} — Matriz`} maxLength={80} />
            </Field>
            {isSql ? (
              <>
                <div className="flex gap-2 text-sm">
                  <Button type="button" size="sm" variant={useCs ? "outline" : "default"} onClick={() => setUseCs(false)}>
                    Campos
                  </Button>
                  <Button type="button" size="sm" variant={useCs ? "default" : "outline"} onClick={() => setUseCs(true)}>
                    Connection string
                  </Button>
                </div>
                {useCs ? (
                  <Field label="Connection string" hint="Usada somente para conectar. Após salvar, ela nunca é exibida novamente.">
                    <Input type="password" autoComplete="off" value={cs} onChange={(e) => setCs(e.target.value)} placeholder={CS_PLACEHOLDER[kind]} />
                  </Field>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-6">
                    <Field label={kind === "sqlserver" ? "Server" : "Host"} className="sm:col-span-4">
                      <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="db.suaempresa.com.br" autoComplete="off" />
                    </Field>
                    <Field label="Porta" className="sm:col-span-2">
                      <Input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} />
                    </Field>
                    <Field label="Database" className="sm:col-span-2">
                      <Input value={database} onChange={(e) => setDatabase(e.target.value)} autoComplete="off" />
                    </Field>
                    <Field label={kind === "sqlserver" ? "Username" : "Usuário"} className="sm:col-span-2">
                      <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
                    </Field>
                    <Field label={kind === "sqlserver" ? "Password" : "Senha"} className="sm:col-span-2">
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                    </Field>
                  </div>
                )}
                {kind === "sqlserver" ? (
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} /> Encrypt
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={trustCert} onChange={(e) => setTrustCert(e.target.checked)} /> Trust Server Certificate
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} /> Usar SSL/TLS (recomendado)
                  </label>
                )}
                <Notice tone="info">
                  <p className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="size-4" /> O JR Cortex funciona somente com leitura
                  </p>
                  <p className="mt-1">A sessão é aberta em modo somente leitura e apenas consultas SELECT geradas pelo sistema são executadas — nunca INSERT, UPDATE, DELETE, DROP, ALTER ou TRUNCATE. Recomendamos criar um usuário dedicado apenas com permissão SELECT:</p>
                  <pre className="mt-2 overflow-x-auto rounded bg-background/70 p-2 text-[11px]">{READONLY_SQL[kind]}</pre>
                </Notice>
              </>
            ) : (
              <>
                <Field label="Base URL">
                  <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.seusistema.com.br/v1" />
                </Field>
                <Field label="Autenticação">
                  <Select value={authType} onChange={(e) => setAuthType(e.target.value)}>
                    <option value="NONE">Nenhuma</option>
                    <option value="API_KEY">API Key</option>
                    <option value="BEARER_TOKEN">Bearer Token</option>
                    <option value="BASIC_AUTH">Basic Auth</option>
                  </Select>
                </Field>
                {authType === "API_KEY" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Header da chave">
                      <Input value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} />
                    </Field>
                    <Field label="API Key">
                      <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                    </Field>
                  </div>
                ) : null}
                {authType === "BEARER_TOKEN" ? (
                  <Field label="Token">
                    <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
                  </Field>
                ) : null}
                {authType === "BASIC_AUTH" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Usuário">
                      <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
                    </Field>
                    <Field label="Senha">
                      <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                    </Field>
                  </div>
                ) : null}
                <div>
                  <p className="mb-1.5 text-sm font-medium">Headers personalizados</p>
                  {headers.map((h, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <Input placeholder="Nome" value={h.name} onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      <Input placeholder="Valor" type="password" autoComplete="off" value={h.value} onChange={(e) => setHeaders((hs) => hs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover header" onClick={() => setHeaders((hs) => hs.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setHeaders((hs) => [...hs, { name: "", value: "" }])}>
                    <Plus /> Header
                  </Button>
                </div>
                <div>
                  <p className="mb-1.5 text-sm font-medium">Endpoints (somente GET)</p>
                  {endpoints.map((ep, i) => (
                    <div key={i} className="mb-2 grid grid-cols-[1fr_10rem_auto] gap-2">
                      <Input placeholder="/customers" value={ep.path} onChange={(e) => setEndpoints((es) => es.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))} />
                      <Input placeholder="lista em (ex.: data)" value={ep.dataPath} onChange={(e) => setEndpoints((es) => es.map((x, j) => (j === i ? { ...x, dataPath: e.target.value } : x)))} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover endpoint" onClick={() => setEndpoints((es) => es.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" disabled={endpoints.length >= 30} onClick={() => setEndpoints((es) => [...es, { path: "", dataPath: "" }])}>
                    <Plus /> Endpoint
                  </Button>
                  <p className="mt-1.5 text-xs text-muted-foreground">Ex.: /customers, /sales, /products, /invoices, /orders. &quot;Lista em&quot; é o caminho do array na resposta JSON (vazio = detecção automática).</p>
                </div>
                <Notice tone="info">Tokens, chaves e senhas são cifrados no Vault e nunca são mostrados depois de salvos.</Notice>
              </>
            )}
            <PrivateNetworkHelp />
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{kind === "rest-api" ? "Testar API" : "Testar conexão"}</CardTitle>
            <CardDescription>A integração só pode ser salva depois de uma conexão bem-sucedida.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runTest} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Lock />} {kind === "rest-api" ? "Testar API" : "Testar conexão"}
            </Button>
            {test?.ok ? (
              <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-success">
                  <CheckCircle2 className="size-4" /> {test.message}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Tempo de resposta: {test.durationMs} ms · {kind === "rest-api" ? `${test.endpoints?.length ?? 0} endpoints` : `${test.tables.length} tabelas/views encontradas`}
                </p>
              </div>
            ) : null}
            {test && !test.ok ? <ErrorBox result={test} /> : null}
            {test?.endpoints?.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1">Endpoint</th>
                    <th>Status HTTP</th>
                    <th>Tempo de resposta</th>
                    <th>Itens</th>
                  </tr>
                </thead>
                <tbody>
                  {test.endpoints.map((e) => (
                    <tr key={e.path} className="border-t">
                      <td className="py-1.5 font-mono text-xs">{e.path}</td>
                      <td>
                        <Badge variant={e.status >= 200 && e.status < 300 ? "success" : "critical"}>{e.status}</Badge>
                      </td>
                      <td>{e.ms} ms</td>
                      <td>{e.items}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {test && !test.ok ? <PrivateNetworkHelp /> : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Selecionar dados</CardTitle>
            <CardDescription>{kind === "rest-api" ? "Escolha os endpoints que serão lidos." : "Escolha as tabelas ou views que o Cortex poderá ler. Nada além delas é acessado."}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Filtrar tabelas" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              <span className="text-sm text-muted-foreground">{selected.size} selecionada(s)</span>
            </div>
            <div className="max-h-[26rem] space-y-3 overflow-y-auto rounded-lg border p-3">
              {[...grouped.entries()].map(([schema, tables]) => (
                <div key={schema || "_"}>
                  {kind !== "rest-api" ? <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Schema {schema || "(padrão)"}</p> : null}
                  <div className="grid gap-1 sm:grid-cols-2">
                    {tables.map((t) => {
                      const k = tkey(t);
                      return (
                        <label key={k} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={selected.has(k)}
                            onChange={(e) =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(k);
                                else n.delete(k);
                                return n;
                              })
                            }
                          />
                          <span className="truncate font-mono text-xs">{t.name}</span>
                          {t.type === "VIEW" ? <Badge variant="secondary">view</Badge> : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!grouped.size ? <p className="text-sm text-muted-foreground">Nenhuma tabela encontrada. Verifique se o usuário tem permissão SELECT.</p> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <div className="space-y-4">
          <Notice tone="info">Associe cada tabela a um tipo de dado do Cortex e indique qual coluna corresponde a cada campo. A coluna incremental (ex.: updated_at) permite ler apenas o que mudou desde a última sincronização.</Notice>
          {discovered.map((t) => {
            const k = tkey(t);
            const s = selections[k];
            if (!s) return null;
            const set = (patch: Partial<Selection>) => setSelections((all) => ({ ...all, [k]: { ...all[k], ...patch } }));
            const incCandidates = t.columns.filter((c) => c.kind === "date" || c.kind === "number" || c.kind === "other");
            return (
              <Card key={k} className={cn(!s.enabled && "opacity-60")}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="font-mono text-sm">{tlabel(t, kind)}</CardTitle>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Sincronizar
                    </label>
                  </div>
                  <CardDescription>{t.columns.length} colunas detectadas</CardDescription>
                </CardHeader>
                {s.enabled ? (
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Tipo de dado no Cortex">
                        <Select
                          value={s.entity ?? ""}
                          onChange={(e) => {
                            const entity = e.target.value || null;
                            set({ entity, mapping: entity === t.suggestedEntity ? t.suggestedMapping : autoMap(fields[entity ?? ""] ?? [], t.columns) });
                          }}
                        >
                          <option value="">Selecione...</option>
                          {Object.entries(entityLabels).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Coluna incremental" hint="Somente registros com valor maior ou igual ao último lido são buscados.">
                        <Select value={s.incrementalColumn ?? ""} onChange={(e) => set({ incrementalColumn: e.target.value || null })}>
                          <option value="">Nenhuma (leitura completa)</option>
                          {incCandidates.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} ({c.type})
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    {s.entity ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(fields[s.entity] ?? []).map((f) => (
                          <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                            <Select value={s.mapping[f.key] ?? ""} onChange={(e) => set({ mapping: { ...s.mapping, [f.key]: e.target.value || null } })}>
                              <option value="">— não mapear —</option>
                              {t.columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name} · {c.type}
                                </option>
                              ))}
                            </Select>
                          </Field>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                ) : null}
              </Card>
            );
          })}
          {mapErrs.length ? (
            <Notice tone="warning">
              <ul className="list-disc pl-4">
                {mapErrs.slice(0, 6).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
        </div>
      ) : null}

      {step === 5 ? (
        <Card>
          <CardHeader>
            <CardTitle>Definir sincronização</CardTitle>
            <CardDescription>Cada execução abre a conexão, lê em lotes de 1.000 registros e fecha a conexão ao final.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {INTERVALS.map((o) => (
              <label key={String(o.value)} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 text-sm", interval === o.value && "border-primary bg-primary/5")}>
                <input type="radio" name="interval" checked={interval === o.value} onChange={() => setInterval(o.value)} />
                <span>
                  <strong>{o.label}</strong>
                  <span className="block text-muted-foreground">{o.hint}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {step === 6 ? (
        <Card>
          <CardHeader>
            <CardTitle>Concluir</CardTitle>
            <CardDescription>Revise antes de salvar. A conexão será testada novamente no servidor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Fonte:</span> <strong>{sourceLabel}</strong> <Badge variant="success">DADOS REAIS</Badge>
            </p>
            <p>
              <span className="text-muted-foreground">Conexão:</span> {isSql ? (useCs ? "connection string (oculta)" : `${host}:${port || DEFAULT_PORT[kind]} / ${database}`) : baseUrl}
            </p>
            <p>
              <span className="text-muted-foreground">Senha/token:</span> ••••••••••••
            </p>
            <p>
              <span className="text-muted-foreground">Tabelas:</span>{" "}
              {discovered
                .filter((t) => selections[tkey(t)]?.enabled)
                .map((t) => `${tlabel(t, kind)} → ${entityLabels[selections[tkey(t)].entity ?? ""] ?? "?"}`)
                .join(", ")}
            </p>
            <p>
              <span className="text-muted-foreground">Sincronização:</span> {INTERVALS.find((i) => i.value === interval)?.label}
            </p>
            <Notice tone="info">Após salvar, clique em &quot;Sincronizar agora&quot; para trazer os dados. O Cortex AI analisará apenas os dados normalizados — nunca credenciais.</Notice>
          </CardContent>
        </Card>
      ) : null}

      {step > 0 ? (
        <div className="mt-5 flex items-center justify-between gap-2">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={busy}>
            <ArrowLeft /> Voltar
          </Button>
          {step === 1 ? (
            <Button onClick={() => setStep(2)} disabled={Boolean(connErr)} title={connErr ?? undefined}>
              Continuar <ArrowRight />
            </Button>
          ) : step === 2 ? (
            <Button onClick={() => setStep(3)} disabled={!test?.ok}>
              Continuar <ArrowRight />
            </Button>
          ) : step === 3 ? (
            <Button onClick={loadColumns} disabled={!selected.size || busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Ler colunas <ArrowRight />
            </Button>
          ) : step === 4 ? (
            <Button onClick={() => setStep(5)} disabled={mapErrs.length > 0}>
              Continuar <ArrowRight />
            </Button>
          ) : step === 5 ? (
            <Button onClick={() => setStep(6)}>
              Continuar <ArrowRight />
            </Button>
          ) : (
            <Button onClick={save} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Salvar integração
            </Button>
          )}
        </div>
      ) : null}
      {step === 1 && connErr ? (
        <p className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
          <AlertTriangle className="size-3" /> {connErr}
        </p>
      ) : null}
    </div>
  );
}

/** Mapeamento simples por nome quando o usuário troca a entidade manualmente. */
function autoMap(fields: FieldDefLite[], columns: Column[]): Record<string, string | null> {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const used = new Set<string>();
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    const hit = columns.find((c) => !used.has(c.name) && (norm(c.name) === norm(f.key) || norm(c.name) === norm(f.label)));
    out[f.key] = hit?.name ?? null;
    if (hit) used.add(hit.name);
  }
  return out;
}

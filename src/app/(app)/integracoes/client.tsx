"use client";

import { Loader2, MoreHorizontal, Plus, Power, PowerOff, RefreshCw, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { api } from "@/lib/api-client";

interface CatalogItem {
  id: string;
  label: string;
  type: string;
  description: string;
  availability: "available" | "mock" | "planned";
  credentialFields: { key: string; label: string; secret: boolean; required: boolean }[];
}

const CONFIG_TEMPLATES: Record<string, string> = {
  "google-sheets": JSON.stringify({ spreadsheetId: "ID_DA_PLANILHA", gid: "0", target: "SALES" }, null, 2),
};

export function NewIntegrationDialog({ catalog }: { catalog: CatalogItem[] }) {
  const router = useRouter();
  // bancos e APIs REST usam o assistente de 7 etapas (/integracoes/nova)
  const connectable = catalog.filter((c) => !["csv", "xlsx", "manual", "rest-api", "postgresql", "mysql", "sqlserver"].includes(c.id));
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState(connectable[0]?.id ?? "");
  const provider = useMemo(() => catalog.find((c) => c.id === providerId), [catalog, providerId]);
  const [name, setName] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [config, setConfig] = useState("");
  const [interval, setInterval] = useState("1440");
  const [saving, setSaving] = useState(false);

  async function submit() {
    let parsedConfig: Record<string, unknown> = {};
    if (config.trim()) {
      try {
        parsedConfig = JSON.parse(config) as Record<string, unknown>;
      } catch {
        toast.error("Configuração JSON inválida.");
        return;
      }
    }
    setSaving(true);
    try {
      const r = await api<{ status: string }>("/api/integrations", { method: "POST", json: { provider: providerId, name: name || provider?.label, credentials: creds, config: parsedConfig, syncIntervalMinutes: interval ? Number(interval) : null } });
      toast.success(r.status === "NOT_IMPLEMENTED" ? "Integração registrada. Este conector ainda depende de API externa — nenhuma sincronização será feita." : "Integração criada.");
      setOpen(false);
      setCreds({});
      setName("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Outros conectores
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Outros conectores</DialogTitle>
          <DialogDescription>Google Sheets, ERP Demo (dados de demonstração) e conectores planejados. Credenciais são cifradas e nunca exibidas novamente.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Conector">
            <Select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setConfig(CONFIG_TEMPLATES[e.target.value] ?? "");
                setCreds({});
              }}
            >
              {connectable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.availability === "planned" ? " — requer API externa" : c.availability === "mock" ? " — DEMO" : ""}
                </option>
              ))}
            </Select>
          </Field>
          {provider?.availability === "planned" ? <Notice tone="warning">Este conector tem arquitetura pronta, mas depende de API/credenciais externas ainda não disponíveis. Ele será registrado sem sincronizar dados.</Notice> : null}
          {provider?.availability === "mock" ? <Notice tone="warning">Conector DEMO: gera dados sintéticos de demonstração, identificados como DEMO. Não representa dados reais da empresa.</Notice> : null}
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={provider?.label} maxLength={80} />
          </Field>
          {provider?.credentialFields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
              <Input type={f.secret ? "password" : "text"} autoComplete="off" value={creds[f.key] ?? ""} onChange={(e) => setCreds((c) => ({ ...c, [f.key]: e.target.value }))} />
            </Field>
          ))}
          {CONFIG_TEMPLATES[providerId] ? (
            <Field label="Configuração (JSON)" hint="Mapeamento de campos do sistema de origem para o modelo do Cortex.">
              <Textarea rows={8} className="font-mono text-xs" value={config} onChange={(e) => setConfig(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Sincronização agendada">
            <Select value={interval} onChange={(e) => setInterval(e.target.value)}>
              <option value="">Somente manual</option>
              <option value="60">A cada hora</option>
              <option value="360">A cada 6 horas</option>
              <option value="1440">Diariamente</option>
            </Select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Salvando..." : "Criar integração"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationActions({ id, status, compact = false }: { id: string; status: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      /* toast já exibido */
    } finally {
      setBusy(null);
      router.refresh();
    }
  };
  const disabled = status === "DISABLED";
  const planned = status === "NOT_IMPLEMENTED";
  const sync = (mode: "INCREMENTAL" | "REPROCESS") =>
    run("sync", async () => {
      const r = await api<{ job: { status: string; recordsProcessed: number; recordsRejected: number; errorMessage: string | null } }>(`/api/integrations/${id}/sync`, { method: "POST", json: { mode } });
      const msg = `${r.job.recordsProcessed} registros processados, ${r.job.recordsRejected} rejeitados.`;
      if (r.job.status === "FAILED") toast.error(r.job.errorMessage ?? "Falha na sincronização.", { description: msg });
      else if (r.job.status === "PARTIAL") toast.warning(`Sincronização parcial: ${msg}`);
      else toast.success(`Sincronização concluída: ${msg}`);
    });
  const toggle = () =>
    run("toggle", async () => {
      if (!disabled && !window.confirm("Desativar esta integração? As sincronizações automáticas serão interrompidas. Os dados já sincronizados permanecem.")) return;
      await api(`/api/integrations/${id}`, { method: "PATCH", json: { status: disabled ? "CONNECTED" : "DISABLED" } });
      toast.success(disabled ? "Integração reativada." : "Integração desativada.");
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!compact ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/integracoes/${id}`}>
            <Settings2 /> Configurar
          </Link>
        </Button>
      ) : null}
      {!planned ? (
        <Button size="sm" onClick={() => sync("INCREMENTAL")} disabled={Boolean(busy) || disabled || status === "SYNCING"}>
          {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />} {status === "ERROR" ? "Tentar novamente" : "Sincronizar agora"}
        </Button>
      ) : null}
      {!planned ? (
        <Button size="sm" variant="outline" onClick={toggle} disabled={Boolean(busy)}>
          {disabled ? <Power /> : <PowerOff />} {disabled ? "Reativar" : "Desativar"}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={Boolean(busy)} aria-label="Mais ações">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              run("test", async () => {
                const r = await api<{ ok: boolean; message: string; reason?: string }>(`/api/integrations/${id}/test`, { method: "POST" });
                if (r.ok) toast.success(r.message);
                else toast.error(r.message, { description: r.reason });
              })
            }
          >
            Testar conexão
          </DropdownMenuItem>
          {!planned && !disabled ? <DropdownMenuItem onSelect={() => sync("REPROCESS")}>Reprocessar tudo</DropdownMenuItem> : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-critical"
            onSelect={() =>
              run("delete", async () => {
                if (!window.confirm("Excluir esta integração? As credenciais serão apagadas; os dados já sincronizados permanecem no Cortex.")) return;
                await api(`/api/integrations/${id}`, { method: "DELETE" });
                toast.success("Integração excluída.");
                router.push("/integracoes");
              })
            }
          >
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

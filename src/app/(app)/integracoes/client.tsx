"use client";

import { MoreHorizontal, Plus } from "lucide-react";
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
  "rest-api": JSON.stringify({ baseUrl: "https://api.seusistema.com.br", endpoints: [{ entity: "sales", path: "/v1/vendas", dataPath: "data", fieldMap: { externalId: "id", date: "data", grossAmount: "valor_total", customerName: "cliente.nome" } }] }, null, 2),
  "google-sheets": JSON.stringify({ spreadsheetId: "ID_DA_PLANILHA", gid: "0", target: "SALES" }, null, 2),
};

export function NewIntegrationDialog({ catalog }: { catalog: CatalogItem[] }) {
  const router = useRouter();
  const connectable = catalog.filter((c) => !["csv", "xlsx", "manual"].includes(c.id));
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
        <Button size="sm">
          <Plus /> Nova integração
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova integração</DialogTitle>
          <DialogDescription>Credenciais são cifradas antes de serem gravadas e nunca são exibidas novamente.</DialogDescription>
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
                  {c.availability === "planned" ? " — requer API externa" : c.availability === "mock" ? " — MOCK" : ""}
                </option>
              ))}
            </Select>
          </Field>
          {provider?.availability === "planned" ? <Notice tone="warning">Este conector tem arquitetura pronta, mas depende de API/credenciais externas ainda não disponíveis. Ele será registrado sem sincronizar dados.</Notice> : null}
          {provider?.availability === "mock" ? <Notice tone="warning">Conector MOCK: gera dados sintéticos para desenvolvimento. Não use em produção.</Notice> : null}
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
              <option value="1440">Diária</option>
              <option value="10080">Semanal</option>
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

export function IntegrationRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const sync = (mode: "INCREMENTAL" | "REPROCESS") =>
    run(async () => {
      const r = await api<{ job: { status: string; recordsProcessed: number; recordsRejected: number } }>(`/api/integrations/${id}/sync`, { method: "POST", json: { mode } });
      const msg = `Sincronização ${r.job.status}: ${r.job.recordsProcessed} processados, ${r.job.recordsRejected} rejeitados.`;
      if (r.job.status === "FAILED") toast.error(msg);
      else toast.success(msg);
    });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={busy} aria-label="Ações">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => sync("INCREMENTAL")}>Sincronizar agora (incremental)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => sync("REPROCESS")}>Reprocessar tudo</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            run(async () => {
              const r = await api<{ ok: boolean; message: string }>(`/api/integrations/${id}/test`, { method: "POST" });
              if (r.ok) toast.success(r.message);
              else toast.error(r.message);
            })
          }
        >
          Testar conexão
        </DropdownMenuItem>
        {status !== "NOT_IMPLEMENTED" ? (
          <DropdownMenuItem onSelect={() => run(async () => void (await api(`/api/integrations/${id}`, { method: "PATCH", json: { status: status === "PAUSED" ? "ACTIVE" : "PAUSED" } })))}>
            {status === "PAUSED" ? "Reativar" : "Pausar"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-critical"
          onSelect={() =>
            run(async () => {
              if (!window.confirm("Excluir esta integração? Os dados já sincronizados permanecem no Cortex.")) return;
              await api(`/api/integrations/${id}`, { method: "DELETE" });
              toast.success("Integração excluída.");
            })
          }
        >
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

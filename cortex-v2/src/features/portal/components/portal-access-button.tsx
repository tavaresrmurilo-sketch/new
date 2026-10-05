"use client";

import * as React from "react";
import { Check, Copy, Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { formatRelativeTime } from "@/lib/format";
import { createPortalAccessAction, listPortalAccessAction, revokePortalAccessAction } from "../actions";

type Access = { id: string; label: string; expiresAt: Date; revokedAt: Date | null; lastAccessAt: Date | null; accessCount: number; createdAt: Date };

function PortalManager({ clientId }: { clientId: string }) {
  const [list, setList] = React.useState<Access[]>([]);
  const [label, setLabel] = React.useState("Acesso do cliente");
  const [days, setDays] = React.useState("90");
  const [url, setUrl] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    const r = await listPortalAccessAction({ clientId });
    if (r.ok) setList(r.data);
  }, [clientId]);
  React.useEffect(() => void load(), [load]);
  return (
    <div className="space-y-4 px-5 py-4">
      <p className="text-[13px] text-muted-foreground">
        O cliente verá apenas o que foi marcado como compartilhado: andamento de projetos, documentos, propostas enviadas e reuniões. Nenhum acesso ao sistema interno.
      </p>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="pa-label">Identificação</Label>
          <Input id="pa-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pa-days">Validade</Label>
          <NativeSelect id="pa-days" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">30 dias</option>
            <option value="90">90 dias</option>
            <option value="180">180 dias</option>
            <option value="365">1 ano</option>
          </NativeSelect>
        </div>
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await createPortalAccessAction({ clientId, label, days: Number(days) });
            setBusy(false);
            if (!r.ok) return toast.error(r.error);
            setUrl(r.data.url);
            void load();
          }}
        >
          Gerar link
        </Button>
      </div>
      {url ? (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-medium">Copie agora — por segurança o link não será exibido novamente.</p>
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar link"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
      ) : null}
      {list.length ? (
        <ul className="divide-y rounded-md border text-[13px]">
          {list.map((a) => {
            const active = !a.revokedAt && new Date(a.expiresAt) > new Date();
            return (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1">
                  <span className="font-medium">{a.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {active ? `Expira ${formatRelativeTime(a.expiresAt).replace("há", "em")}` : a.revokedAt ? "Revogado" : "Expirado"} · {a.accessCount} acesso(s)
                    {a.lastAccessAt ? ` · último ${formatRelativeTime(a.lastAccessAt)}` : ""}
                  </span>
                </span>
                {active ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      const r = await revokePortalAccessAction({ id: a.id });
                      if (r.ok) {
                        toast.success("Acesso revogado");
                        void load();
                      }
                    }}
                  >
                    <Trash2 /> Revogar
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function PortalAccessButton({ clientId }: { clientId: string }) {
  return (
    <EntityDialog
      title="Portal do Cliente"
      description="Gere um link seguro para o cliente acompanhar o que foi compartilhado."
      size="lg"
      trigger={
        <Button size="sm" variant="outline">
          <Globe /> Portal
        </Button>
      }
    >
      {() => <PortalManager clientId={clientId} />}
    </EntityDialog>
  );
}

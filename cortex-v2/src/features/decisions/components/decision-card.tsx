"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { DECISION_TYPE } from "@/lib/labels";
import { resolveDecisionAction } from "../actions";

export interface DecisionView {
  id: string;
  type: string;
  title: string;
  description: string | null;
  source: string;
  createdAt: string;
  createdByName: string | null;
  payload: Record<string, unknown>;
  entityHref: string | null;
  canResolve: boolean;
}

export function DecisionCard({ d, createdLabel }: { d: DecisionView; createdLabel: string }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [keepId, setKeepId] = React.useState<string>(String(d.payload.keepId ?? ""));
  const meta = DECISION_TYPE[d.type] ?? { label: d.type, accept: "Aceitar", reject: "Recusar" };
  const { run, pending } = useAction(resolveDecisionAction, {
    success: (r) => (r.status === "ACCEPTED" ? "Decisão aceita" : r.status === "REJECTED" ? "Decisão recusada" : "Decisão descartada"),
    onSuccess: (r) => {
      if (r.href) router.push(r.href);
    },
  });
  const resolve = (resolution: "ACCEPT" | "REJECT" | "DISMISS") => run({ id: d.id, resolution, note: note || null, keepId: d.type === "RESOLVE_DUPLICATE" ? keepId : null });
  const isDup = d.type === "RESOLVE_DUPLICATE";
  const dupEntity = d.payload.entity === "lead" ? "leads" : "clients";
  const acceptButton = (
    <Button size="sm" loading={pending} disabled={!d.canResolve}>
      <Check /> {meta.accept}
    </Button>
  );
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{meta.label}</span>
        <span>·</span>
        <span className="normal-case tracking-normal">{createdLabel}{d.createdByName ? ` · por ${d.createdByName}` : d.source === "SYSTEM" ? " · gerada pelo sistema" : ""}</span>
      </div>
      <div>
        <p className="text-sm font-medium">{d.title}</p>
        {d.description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{d.description}</p> : null}
        {d.entityHref ? (
          <Link href={d.entityHref} className="mt-1 inline-block text-xs text-primary hover:underline">
            Abrir registro
          </Link>
        ) : null}
      </div>
      {isDup ? (
        <fieldset className="space-y-1.5 rounded-md border p-3 text-[13px]">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Qual registro manter?</legend>
          {[
            { id: String(d.payload.keepId ?? ""), name: String(d.payload.keepName ?? "Registro A") },
            { id: String(d.payload.mergeId ?? ""), name: String(d.payload.mergeName ?? "Registro B") },
          ].map((o) => (
            <label key={o.id} className="flex items-center gap-2">
              <input type="radio" name={`keep-${d.id}`} value={o.id} checked={keepId === o.id} onChange={() => setKeepId(o.id)} />
              <span>{o.name}</span>
              <Link href={`/app/${dupEntity}/${o.id}`} className="text-xs text-primary hover:underline" target="_blank">
                ver
              </Link>
            </label>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">O outro registro será movido para a lixeira e seus vínculos (contatos, oportunidades, projetos, atividades…) passam para o registro mantido.</p>
        </fieldset>
      ) : null}
      {d.canResolve ? (
        <>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comentário (opcional)" rows={2} maxLength={1000} aria-label="Comentário da decisão" />
          <div className="flex flex-wrap gap-2">
            {isDup ? (
              <ConfirmDialog title="Mesclar registros?" description="Esta ação move todos os vínculos para o registro mantido. O outro registro vai para a lixeira." confirmLabel="Mesclar" destructive trigger={acceptButton} onConfirm={() => resolve("ACCEPT")} />
            ) : (
              <Button size="sm" loading={pending} onClick={() => resolve("ACCEPT")}>
                <Check /> {meta.accept}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => resolve("REJECT")}>
              <X /> {meta.reject}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => resolve("DISMISS")}>
              Descartar
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Você não tem permissão para resolver esta decisão.</p>
      )}
    </div>
  );
}

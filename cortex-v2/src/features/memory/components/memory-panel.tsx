"use client";

import * as React from "react";
import { Brain, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { useAction } from "@/hooks/use-action";
import { formatRelativeTime } from "@/lib/format";
import { MEMORY_CATEGORY, MEMORY_SOURCE } from "@/lib/labels";
import { deleteMemoryFactAction, saveMemoryFactAction } from "../actions";

export interface Fact {
  id: string;
  content: string;
  category: string;
  source: string;
  sourceRef: string | null;
  authorName: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

function FactEditor({ initial, onSave, onCancel, pending }: { initial?: { content: string; category: string }; onSave: (v: { content: string; category: string }) => void; onCancel: () => void; pending: boolean }) {
  const [content, setContent] = React.useState(initial?.content ?? "");
  const [category, setCategory] = React.useState(initial?.category ?? "CONTEXT");
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <Textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ex.: Cliente prefere reuniões pela manhã." aria-label="Fato" autoFocus />
      <div className="flex items-center gap-2">
        <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-40 text-[13px]" aria-label="Categoria">
          {Object.entries(MEMORY_CATEGORY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" loading={pending} disabled={content.trim().length < 3} onClick={() => onSave({ content, category })}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Córtex Memory: fatos confirmados com fonte, autor, edição e exclusão. */
export function MemoryPanel({ facts, target, canWrite }: { facts: Fact[]; target: { clientId?: string; projectId?: string; opportunityId?: string }; canWrite: boolean }) {
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const save = useAction(saveMemoryFactAction, { success: "Fato salvo", onSuccess: () => { setAdding(false); setEditing(null); } });
  const del = useAction(deleteMemoryFactAction, { success: "Fato removido" });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">Fatos confirmados pela equipe. O Córtex AI pode consultá-los, sempre citando a fonte.</p>
        {canWrite && !adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Registrar fato
          </Button>
        ) : null}
      </div>
      {adding ? <FactEditor pending={save.pending} onCancel={() => setAdding(false)} onSave={(v) => void save.run({ ...v, ...target, category: v.category as "CONTEXT" })} /> : null}
      {!facts.length && !adding ? <EmptyState compact icon={Brain} title="Nenhum fato registrado" description="Registre preferências, exigências e dependências importantes para que ninguém esqueça." /> : null}
      <ul className="space-y-2">
        {facts.map((f) =>
          editing === f.id ? (
            <li key={f.id}>
              <FactEditor initial={f} pending={save.pending} onCancel={() => setEditing(null)} onSave={(v) => void save.run({ id: f.id, ...v, ...target, category: v.category as "CONTEXT" })} />
            </li>
          ) : (
            <li key={f.id} className="group rounded-lg border bg-card p-3">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm">{f.content}</p>
                {canWrite ? (
                  <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Button size="icon-xs" variant="ghost" aria-label="Editar fato" onClick={() => setEditing(f.id)}>
                      <Pencil />
                    </Button>
                    <ConfirmDialog
                      title="Excluir este fato?"
                      destructive
                      confirmLabel="Excluir"
                      trigger={
                        <Button size="icon-xs" variant="ghost" aria-label="Excluir fato">
                          <Trash2 />
                        </Button>
                      }
                      onConfirm={() => del.run({ id: f.id })}
                    />
                  </div>
                ) : null}
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge>{MEMORY_CATEGORY[f.category]}</Badge>
                Fonte: {MEMORY_SOURCE[f.source]} · {f.authorName ?? "—"} · {formatRelativeTime(f.createdAt)}
                {new Date(f.updatedAt).getTime() - new Date(f.createdAt).getTime() > 60_000 ? " · editado" : ""}
              </p>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

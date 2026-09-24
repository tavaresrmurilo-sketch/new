"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { api } from "@/lib/api-client";
import { fmt } from "@/lib/format";

const TYPES: Record<string, string> = {
  INDICATOR: "Indicador",
  ACCOUNTING_RULE: "Regra contábil",
  CHART_OF_ACCOUNTS: "Plano de contas",
  GOAL: "Meta",
  DEFINITION: "Definição",
  POLICY: "Política",
  SYSTEM: "Sistema",
  COMPANY_CONTEXT: "Contexto da empresa",
};

interface Item {
  id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  active: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export function KnowledgeManager({ items, canManage }: { items: Item[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const body = { type: editing.type ?? "DEFINITION", title: editing.title ?? "", content: editing.content ?? "", tags: editing.tags ?? [], active: editing.active ?? true };
      if (editing.id) await api(`/api/knowledge/${editing.id}`, { method: "PATCH", json: body });
      else await api("/api/knowledge", { method: "POST", json: body });
      toast.success("Conhecimento salvo.");
      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Excluir este item de conhecimento?")) return;
    await api(`/api/knowledge/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      {canManage ? (
        <div className="mb-4">
          <Button size="sm" onClick={() => setEditing({ type: "DEFINITION", active: true, tags: [] })}>
            <Plus /> Novo item
          </Button>
        </div>
      ) : null}
      {!items.length ? (
        <EmptyState title="Nenhum conhecimento cadastrado" description="Cadastre definições de indicadores, políticas e contexto da empresa para orientar as respostas do Cortex." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => (
            <Card key={i.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant="secondary">{TYPES[i.type] ?? i.type}</Badge>
                  {!i.active ? <Badge variant="warning" className="ml-1">Inativo</Badge> : null}
                  <p className="mt-2 text-sm font-semibold">{i.title}</p>
                </div>
                {canManage ? (
                  <div className="flex">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(i)} aria-label="Editar">
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(i.id)} aria-label="Excluir">
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="mt-1 flex-1 whitespace-pre-line text-sm text-muted-foreground">{i.content}</p>
              <p className="mt-3 text-[11px] text-muted-foreground">
                v{i.version} · {fmt.dateTime(i.updatedAt)}
                {i.updatedBy ? ` · ${i.updatedBy}` : ""}
              </p>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar conhecimento" : "Novo conhecimento"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Field label="Tipo">
              <Select value={editing?.type ?? "DEFINITION"} onChange={(e) => setEditing((x) => ({ ...x, type: e.target.value }))}>
                {Object.entries(TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Título">
              <Input value={editing?.title ?? ""} onChange={(e) => setEditing((x) => ({ ...x, title: e.target.value }))} maxLength={120} />
            </Field>
            <Field label="Conteúdo">
              <Textarea rows={6} value={editing?.content ?? ""} onChange={(e) => setEditing((x) => ({ ...x, content: e.target.value }))} maxLength={5000} />
            </Field>
            <Field label="Palavras-chave (separadas por vírgula)">
              <Input value={(editing?.tags ?? []).join(", ")} onChange={(e) => setEditing((x) => ({ ...x, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }))} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing?.active ?? true} onChange={(e) => setEditing((x) => ({ ...x, active: e.target.checked }))} /> Ativo
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving || !editing?.title || !editing?.content}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteCategory, saveCategory } from "@/app/admin/actions/catalog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { slugify } from "@/lib/text";
import { Toggle } from "./form-bits";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  active: boolean;
  productCount: number;
}

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<CategoryRow> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    setSaving(true);
    const result = await saveCategory({
      id: editing.id,
      name: editing.name ?? "",
      slug: editing.slug ?? "",
      description: editing.description ?? "",
      position: editing.position ?? categories.length,
      active: editing.active ?? true,
    });
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fields ?? {});
      toast.error(result.error);
      return;
    }
    toast.success("Categoria salva");
    setEditing(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setErrors({}); setEditing({ active: true, position: categories.length }); }}>
          <Plus className="h-4 w-4" /> Nova categoria
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-4 px-5 py-3.5">
            <span className="w-8 font-mono text-xs text-muted tabular-nums">{c.position}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {c.name}
                {!c.active && <span className="ml-2 rounded bg-sunken px-1.5 py-0.5 text-xs text-muted">inativa</span>}
              </p>
              <p className="font-mono text-xs text-muted">
                /categoria/{c.slug} · {c.productCount} {c.productCount === 1 ? "produto" : "produtos"}
              </p>
            </div>
            <button type="button" aria-label={`Editar ${c.name}`} onClick={() => { setErrors({}); setEditing(c); }} className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Excluir ${c.name}`}
              onClick={async () => {
                if (!window.confirm(`Excluir a categoria "${c.name}"?`)) return;
                const result = await deleteCategory(c.id);
                if (!result.ok) toast.error(result.error);
                else {
                  toast.success("Categoria excluída");
                  router.refresh();
                }
              }}
              className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {categories.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Nenhuma categoria ainda.</li>}
      </ul>

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.id ? "Editar categoria" : "Nova categoria"}
        footer={
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        }
      >
        {editing && (
          <div className="space-y-4 py-5">
            <Field label="Nome" htmlFor="cat-name" error={errors.name}>
              <Input id="cat-name" value={editing.name ?? ""} onChange={(e) => setEditing((c) => ({ ...c, name: e.target.value, slug: c?.id ? c.slug : slugify(e.target.value) }))} />
            </Field>
            <Field label="Endereço (slug)" htmlFor="cat-slug" error={errors.slug} hint={`/categoria/${editing.slug ?? ""}`}>
              <Input id="cat-slug" value={editing.slug ?? ""} onChange={(e) => setEditing((c) => ({ ...c, slug: slugify(e.target.value) }))} className="font-mono text-sm" />
            </Field>
            <Field label="Descrição" htmlFor="cat-desc" optional error={errors.description}>
              <Input id="cat-desc" value={editing.description ?? ""} maxLength={240} onChange={(e) => setEditing((c) => ({ ...c, description: e.target.value }))} />
            </Field>
            <Field label="Ordem de exibição" htmlFor="cat-pos" hint="Menor aparece primeiro">
              <Input id="cat-pos" type="number" min={0} value={editing.position ?? 0} onChange={(e) => setEditing((c) => ({ ...c, position: Math.max(0, Number(e.target.value) || 0) }))} />
            </Field>
            <Toggle checked={editing.active ?? true} onChange={(active) => setEditing((c) => ({ ...c, active }))} label="Ativa na loja" />
          </div>
        )}
      </Sheet>
    </>
  );
}

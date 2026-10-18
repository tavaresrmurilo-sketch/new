"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/components/events/category-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { saveCategoryAction } from "@/server/admin/actions";
import { idle } from "@/lib/action";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cn } from "@/lib/utils";

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  sortOrder: number;
  active: boolean;
}

const ICON_LABEL: Record<string, string> = {
  music: "Música",
  "party-popper": "Festa",
  tent: "Festival",
  drama: "Teatro",
  laugh: "Humor",
  palette: "Arte",
  clapperboard: "Cinema",
  "utensils-crossed": "Gastronomia",
  store: "Feira",
  dumbbell: "Esporte",
  footprints: "Passeio",
  baby: "Infantil",
  "graduation-cap": "Curso",
  briefcase: "Negócios",
  sparkles: "Outros",
};

/** Pino do mapa como aparece para o público (mesmo desenho do mapa e do mini-mapa). */
export function CategoryPin({ color, icon, size = "md" }: { color: string; icon: string; size?: "sm" | "md" }) {
  return (
    <span aria-hidden className={cn("relative inline-grid shrink-0 place-items-center", size === "md" ? "size-14" : "size-11")}>
      <span
        className={cn(
          "grid place-items-center rounded-full rounded-br-none text-white shadow-float ring-[3px] ring-white/90 [transform:rotate(45deg)] dark:ring-black/40",
          size === "md" ? "size-11" : "size-9",
        )}
        style={{ background: color }}
      >
        <CategoryIcon icon={icon} className={cn("[transform:rotate(-45deg)]", size === "md" ? "size-5" : "size-4")} />
      </span>
    </span>
  );
}

function CategoryForm({ category, onDone }: { category?: CategoryRow; onDone: () => void }) {
  const id = useId();
  const router = useRouter();
  const { state, onSubmit, pending } = useActionForm(saveCategoryAction, idle);
  const [color, setColor] = useState(category?.color ?? "#7C5CFF");
  const [icon, setIcon] = useState(category?.icon ?? "sparkles");
  const [active, setActive] = useState(category?.active ?? true);
  const [name, setName] = useState(category?.name ?? "");

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Salvo.");
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#7C5CFF";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="icon" value={icon} />
      <input type="hidden" name="active" value={active ? "on" : ""} />

      <div className="flex items-center gap-4 rounded-2xl bg-surface-2/70 p-4">
        <CategoryPin color={hex} icon={icon} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-subtle-foreground">Prévia do pino no mapa</p>
          <p className="truncate font-bold">{name || "Nome da categoria"}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: hex }}>
            <CategoryIcon icon={icon} className="size-3.5" /> Filtro
          </span>
        </div>
      </div>

      <Field label="Nome" htmlFor={`${id}-name`} error={fieldError(state, "name")}>
        <Input id={`${id}-name`} name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required aria-invalid={Boolean(fieldError(state, "name")) || undefined} />
      </Field>

      {!category && (
        <Field label="Identificador (slug)" htmlFor={`${id}-slug`} error={fieldError(state, "slug")} hint="Aparece na URL dos filtros. Não pode ser alterado depois.">
          <Input id={`${id}-slug`} name="slug" placeholder="ex.: musica-ao-vivo" maxLength={40} autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={Boolean(fieldError(state, "slug")) || undefined} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Cor" htmlFor={`${id}-color`} error={fieldError(state, "color")}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Escolher cor"
              value={hex}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="h-12 w-12 shrink-0 cursor-pointer rounded-2xl border border-input bg-surface p-1"
            />
            <Input id={`${id}-color`} name="color" value={color} onChange={(e) => setColor(e.target.value)} maxLength={7} className="min-w-0 font-mono uppercase" />
          </div>
        </Field>
        <Field label="Ordem" htmlFor={`${id}-order`} error={fieldError(state, "sortOrder")} hint="Menor aparece antes.">
          <Input id={`${id}-order`} name="sortOrder" type="number" inputMode="numeric" min={0} max={999} defaultValue={category?.sortOrder ?? 50} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Ícone</legend>
        <div role="radiogroup" aria-label="Ícone da categoria" className="grid grid-cols-5 gap-2 sm:grid-cols-8">
          {CATEGORY_ICON_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={icon === n}
              aria-label={ICON_LABEL[n] ?? n}
              title={ICON_LABEL[n] ?? n}
              onClick={() => setIcon(n)}
              className={cn(
                "grid h-11 place-items-center rounded-xl border transition",
                icon === n ? "border-transparent text-white" : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
              )}
              style={icon === n ? { background: hex } : undefined}
            >
              <CategoryIcon icon={n} className="size-5" />
            </button>
          ))}
        </div>
        {fieldError(state, "icon") && <p className="mt-2 text-[13px] font-medium text-danger">{fieldError(state, "icon")}</p>}
      </fieldset>

      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold">Ativa</span>
          <span className="block text-[13px] text-muted-foreground">Inativas somem dos filtros e do editor de eventos; eventos existentes continuam.</span>
        </span>
        <Switch checked={active} onCheckedChange={setActive} aria-label="Categoria ativa" />
      </label>

      <FormMessage state={state.status === "error" ? state : idle} />
      <SubmitButton pending={pending} variant="primary" block>
        {category ? "Salvar categoria" : "Criar categoria"}
      </SubmitButton>
    </form>
  );
}

export function CategoryEditButton({ category }: { category?: CategoryRow }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {category ? (
          <Button variant="ghost" size="sm" className="h-11 sm:h-9" aria-label={`Editar ${category.name}`}>
            <Pencil /> Editar
          </Button>
        ) : (
          <Button variant="primary">
            <Plus /> Nova categoria
          </Button>
        )}
      </DialogTrigger>
      <DialogContent title={category ? `Editar ${category.name}` : "Nova categoria"} description={category ? `/${category.slug}` : "Crie uma categoria para organizar os eventos no mapa."}>
        {open && <CategoryForm category={category} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

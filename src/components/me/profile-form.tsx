"use client";

import { Camera, Trash, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/events/category-icon";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/action";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { setAvatarAction, updateProfileAction } from "@/server/me/actions";
import { CitySearch, type CityValue } from "./city-search";

const MAX_BYTES = 8 * 1024 * 1024;

/** Foto de perfil: envio para /api/uploads (purpose "avatar") e gravação imediata. */
export function AvatarUploader({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha uma imagem (JPG, PNG, WebP ou HEIC).");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("A imagem pode ter no máximo 8 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("purpose", "avatar");
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { url?: string; thumbUrl?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Não foi possível enviar a foto agora.");
        return;
      }
      const saved = await setAvatarAction(data.url);
      if (saved.status === "error") {
        toast.error(saved.message);
        return;
      }
      setPreview(data.url);
      toast.success("Foto atualizada");
      router.refresh();
    } catch {
      toast.error("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = () =>
    start(async () => {
      const res = await setAvatarAction(null);
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      setPreview(null);
      toast("Foto removida");
      router.refresh();
    });

  const busy = uploading || pending;
  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar name={name} src={preview} size="xl" className={busy ? "opacity-60" : undefined} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="bg-brand-gradient absolute -right-1 -bottom-1 grid size-11 place-items-center rounded-full text-white shadow-float ring-4 ring-surface transition hover:brightness-110 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={preview ? "Trocar foto de perfil" : "Adicionar foto de perfil"}
        >
          {uploading ? <span className="size-5 animate-spin rounded-full border-2 border-white border-r-transparent" /> : <Camera className="size-5" />}
        </button>
      </div>
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted-foreground">JPG, PNG ou WebP de até 8 MB. Aparece no seu perfil e nos convites de equipe.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" className="h-10" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload /> {preview ? "Trocar foto" : "Enviar foto"}
          </Button>
          {preview && (
            <Button type="button" size="sm" variant="ghost" className="h-10 text-danger hover:bg-danger-soft" onClick={remove} loading={pending} disabled={busy}>
              <Trash /> Remover
            </Button>
          )}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

export interface CategoryOption {
  slug: string;
  name: string;
  icon: string;
  color: string;
}

/** Dados do perfil: nome, cidade de referência e categorias favoritas. */
export function ProfileForm({
  name,
  homeCity,
  categories,
  favorites,
}: {
  name: string;
  homeCity: CityValue | null;
  categories: CategoryOption[];
  favorites: string[];
}) {
  const { state, onSubmit, pending } = useActionForm(updateProfileAction, idle);
  const [selected, setSelected] = useState<string[]>(favorites.filter((f) => categories.some((c) => c.slug === f)));
  const toggle = (slug: string) => setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]));

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Field label="Nome" htmlFor="name" error={fieldError(state, "name")} hint="Como você aparece para organizadores quando participa de uma equipe.">
        <Input
          id="name"
          name="name"
          defaultValue={name}
          autoComplete="name"
          required
          maxLength={80}
          aria-invalid={Boolean(fieldError(state, "name")) || undefined}
          aria-describedby={fieldError(state, "name") ? "name-error" : "name-hint"}
        />
      </Field>

      <Field label="Cidade de referência" htmlFor="homeCity" optional hint="O mapa abre nela quando a localização do aparelho não está disponível." error={fieldError(state, "homeCity")}>
        <CitySearch initial={homeCity} inputId="homeCity" />
      </Field>

      <fieldset>
        <legend className="text-sm font-semibold">Categorias favoritas</legend>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {selected.length ? `${selected.length} selecionada${selected.length > 1 ? "s" : ""} — usamos para destacar o que combina com você.` : "Escolha o que você mais curte para destacarmos eventos assim."}
        </p>
        {categories.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = selected.includes(c.slug);
              return (
                <Chip key={c.slug} active={on} color={c.color} icon={<CategoryIcon icon={c.icon} />} onClick={() => toggle(c.slug)} className="h-11">
                  {c.name}
                </Chip>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Nenhuma categoria disponível no momento.</p>
        )}
        {selected.map((s) => (
          <input key={s} type="hidden" name="favoriteCategories" value={s} />
        ))}
        {fieldError(state, "favoriteCategories") && (
          <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
            {fieldError(state, "favoriteCategories")}
          </p>
        )}
      </fieldset>

      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton pending={pending} variant="primary" className="w-full sm:w-auto">
          Salvar alterações
        </SubmitButton>
      </div>
    </form>
  );
}

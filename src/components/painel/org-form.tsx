"use client";

import { AtSign, Globe, Lock, Mail, MessageCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ImageUpload } from "@/components/upload/image-upload";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { BR_STATES } from "@/lib/constants";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { idle, type ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import { ORG_BIO_MAX } from "@/lib/validation/organization";
import { updateOrganizationAction } from "@/server/organizations/actions";

export interface OrgFormValues {
  id: string;
  slug: string;
  name: string;
  bio: string;
  city: string;
  state: string;
  website: string;
  instagram: string;
  whatsapp: string;
  contactEmail: string;
  logoUrl: string | null;
  coverUrl: string | null;
}

function invalid(state: ActionState<unknown>, name: string, id: string) {
  return fieldError(state, name) ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-border py-7 first-of-type:border-t-0 first-of-type:pt-0 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
      <div>
        <h2 className="font-bold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  );
}

function IconInput({ icon, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground [&_svg]:size-[18px]">{icon}</span>
      <Input {...props} className={cn("pl-11", props.className)} />
    </div>
  );
}

/** Perfil público da organização (ADMIN/OWNER editam; EDITOR só visualiza). */
export function OrgForm({ initial, canEdit }: { initial: OrgFormValues; canEdit: boolean }) {
  const router = useRouter();
  const id = useId();
  const { state, onSubmit, pending } = useActionForm(updateOrganizationAction, idle);
  const [bio, setBio] = useState(initial.bio);
  const [logo, setLogo] = useState(initial.logoUrl);
  const [cover, setCover] = useState(initial.coverUrl);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Salvo.");
      router.refresh();
    }
  }, [state, router]);

  const f = (name: string) => ({ id: `${id}-${name}`, name, ...invalid(state, name, `${id}-${name}`) });

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canEdit || pending} className="min-w-0">
        <legend className="sr-only">Perfil da organização</legend>
        <input type="hidden" name="organizationId" value={initial.id} />
        <input type="hidden" name="logoUrl" value={logo ?? ""} />
        <input type="hidden" name="coverUrl" value={cover ?? ""} />

        <FormMessage state={state.status === "error" ? state : idle} className="mb-6" />

        <Section title="Identidade" description="Como sua organização aparece no mapa, nos eventos e no perfil público.">
          <ImageUpload
            round
            purpose="org-logo"
            organizationId={initial.id}
            value={logo}
            onChange={(img) => setLogo(img?.url ?? null)}
            label="Logo"
            hint="Quadrado, mínimo 400 × 400 px."
            disabled={!canEdit}
          />
          <ImageUpload
            purpose="org-cover"
            organizationId={initial.id}
            value={cover}
            onChange={(img) => setCover(img?.url ?? null)}
            aspect="3/1"
            label="Capa do perfil"
            hint="Formato largo (3:1), mínimo 1500 × 500 px."
            disabled={!canEdit}
          />
          {fieldError(state, "image") && (
            <p role="alert" className="text-[13px] font-medium text-danger">
              {fieldError(state, "image")}
            </p>
          )}
          <Field label="Nome" htmlFor={`${id}-name`} error={fieldError(state, "name")}>
            <Input {...f("name")} defaultValue={initial.name} maxLength={80} required autoComplete="organization" />
          </Field>
          <Field label="Endereço público" hint="O endereço do perfil é definido na criação e não muda, para não quebrar links já compartilhados.">
            <div className="flex h-12 items-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 text-[15px] text-muted-foreground">
              <Lock className="size-4 shrink-0" />
              <span className="truncate">/organizador/{initial.slug}</span>
            </div>
          </Field>
          <Field label="Bio" htmlFor={`${id}-bio`} optional error={fieldError(state, "bio")} hint={`${bio.length}/${ORG_BIO_MAX}`}>
            <Textarea {...f("bio")} rows={4} maxLength={ORG_BIO_MAX} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="O que vocês fazem, desde quando, o que o público pode esperar." />
          </Field>
          <div className="grid grid-cols-[1fr_7.5rem] gap-3">
            <Field label="Cidade" htmlFor={`${id}-city`} error={fieldError(state, "city")}>
              <Input {...f("city")} defaultValue={initial.city} maxLength={80} required autoComplete="address-level2" />
            </Field>
            <Field label="UF" htmlFor={`${id}-state`} error={fieldError(state, "state")}>
              <Select {...f("state")} defaultValue={initial.state} required>
                <option value="" disabled>
                  UF
                </option>
                {BR_STATES.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Contato e redes" description="Aparecem no perfil público para quem quiser falar com vocês. Preencha só o que quiser divulgar.">
          <Field label="Site" htmlFor={`${id}-website`} optional error={fieldError(state, "website")}>
            <IconInput icon={<Globe />} {...f("website")} type="url" inputMode="url" defaultValue={initial.website} placeholder="https://seusite.com.br" />
          </Field>
          <Field label="Instagram" htmlFor={`${id}-instagram`} optional error={fieldError(state, "instagram")}>
            <IconInput icon={<AtSign />} {...f("instagram")} defaultValue={initial.instagram} placeholder="seuperfil ou link do Instagram" autoCapitalize="none" />
          </Field>
          <Field label="WhatsApp" htmlFor={`${id}-whatsapp`} optional error={fieldError(state, "whatsapp")} hint="Com DDD. Números do Brasil ganham o +55 automaticamente.">
            <IconInput icon={<MessageCircle />} {...f("whatsapp")} type="tel" inputMode="tel" defaultValue={initial.whatsapp} placeholder="(81) 91234-5678" />
          </Field>
          <Field label="E-mail de contato" htmlFor={`${id}-contactEmail`} optional error={fieldError(state, "contactEmail")} hint="Público. Não precisa ser o e-mail da sua conta.">
            <IconInput icon={<Mail />} {...f("contactEmail")} type="email" inputMode="email" defaultValue={initial.contactEmail} placeholder="contato@suaorganizacao.com.br" />
          </Field>
        </Section>

        {canEdit && (
          <div className="sticky bottom-0 -mx-4 mt-2 flex justify-end border-t border-border bg-background/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <SubmitButton variant="primary" pending={pending} className="w-full sm:w-auto">
              <Save /> Salvar alterações
            </SubmitButton>
          </div>
        )}
      </fieldset>
    </form>
  );
}

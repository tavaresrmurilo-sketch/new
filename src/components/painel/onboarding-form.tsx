"use client";

import { ArrowRight, Check, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ImageUpload } from "@/components/upload/image-upload";
import { Button } from "@/components/ui/button";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { BR_STATES } from "@/lib/constants";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { idle, type ActionState } from "@/lib/action";
import { ORG_BIO_SHORT_MAX } from "@/lib/validation/organization";
import { createOrganizationAction, setOrganizationLogoAction } from "@/server/organizations/actions";

function invalid(state: ActionState<unknown>, name: string, id: string) {
  return fieldError(state, name) ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

/** Passo 1 do onboarding: dados da organização (o servidor leva ao passo do logo). */
export function OnboardingForm({ defaultCity }: { defaultCity?: string | null }) {
  const id = useId();
  const { state, onSubmit, pending } = useActionForm(createOrganizationAction, idle);
  const [bio, setBio] = useState("");

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormMessage state={state} />
      <Field label="Nome da organização" htmlFor={`${id}-name`} error={fieldError(state, "name")} hint="Como o público vai ver: casa de shows, coletivo, produtora, feira…">
        <Input id={`${id}-name`} name="name" required maxLength={80} autoComplete="organization" placeholder="Ex.: Casa do Som" {...invalid(state, "name", `${id}-name`)} />
      </Field>
      <div className="grid grid-cols-[1fr_7.5rem] gap-3">
        <Field label="Cidade" htmlFor={`${id}-city`} error={fieldError(state, "city")}>
          <Input id={`${id}-city`} name="city" required maxLength={80} defaultValue={defaultCity ?? ""} autoComplete="address-level2" {...invalid(state, "city", `${id}-city`)} />
        </Field>
        <Field label="UF" htmlFor={`${id}-state`} error={fieldError(state, "state")}>
          <Select id={`${id}-state`} name="state" required defaultValue="" {...invalid(state, "state", `${id}-state`)}>
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
      <Field
        label="Bio curta"
        htmlFor={`${id}-bio`}
        optional
        error={fieldError(state, "bio")}
        hint={`${bio.length}/${ORG_BIO_SHORT_MAX} · Conte em uma ou duas frases o que vocês fazem.`}
      >
        <Textarea
          id={`${id}-bio`}
          name="bio"
          rows={3}
          maxLength={ORG_BIO_SHORT_MAX}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Ex.: Shows autorais e noites de samba no centro de Recife desde 2015."
          {...invalid(state, "bio", `${id}-bio`)}
        />
      </Field>
      <SubmitButton variant="primary" size="lg" block pending={pending}>
        <Check /> Criar organização
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">Você poderá editar tudo isso depois em “Organização”.</p>
    </form>
  );
}

/** Passo 2 do onboarding: logo opcional. */
export function OnboardingLogo({ organizationId, slug, logoUrl }: { organizationId: string; slug: string; logoUrl: string | null }) {
  const router = useRouter();
  const [logo, setLogo] = useState<string | null>(logoUrl);
  const [saving, start] = useTransition();

  function finish() {
    router.push("/painel?bemvindo=1");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-success-soft text-success">
          <PartyPopper className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight">Organização criada!</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Seu perfil público fica em <span className="font-semibold break-all text-foreground">/organizador/{slug}</span>. Que tal adicionar o logo?
          </p>
        </div>
      </div>
      <ImageUpload
        round
        purpose="org-logo"
        organizationId={organizationId}
        value={logo}
        label="Logo (opcional)"
        hint="Quadrado, de preferência com pelo menos 400 × 400 px."
        onChange={(img) => {
          const previous = logo;
          setLogo(img?.url ?? null);
          start(async () => {
            const res = await setOrganizationLogoAction(organizationId, img?.url ?? null);
            if (res.status === "error") {
              setLogo(previous);
              toast.error(res.message);
            }
          });
        }}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {!logo && (
          <Button type="button" variant="ghost" onClick={finish}>
            Pular por enquanto
          </Button>
        )}
        <Button type="button" variant="primary" size="lg" onClick={finish} loading={saving}>
          Ir para o painel <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

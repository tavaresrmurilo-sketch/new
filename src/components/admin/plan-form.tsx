"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { savePlanAction } from "@/server/admin/actions";
import { idle } from "@/lib/action";
import { useActionForm } from "@/lib/hooks/use-action-form";

export interface PlanRow {
  tier: "FREE" | "PRO" | "BUSINESS";
  name: string;
  tagline: string;
  priceMonthlyCents: number;
  priceYearlyCents: number | null;
  stripePriceMonthly: string | null;
  stripePriceYearly: string | null;
  maxActiveEvents: number | null;
  maxMembers: number;
  maxVenues: number | null;
  boostsPerMonth: number;
  fullAnalytics: boolean;
  csvExport: boolean;
  highlightBadge: boolean;
  active: boolean;
}

const money = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2).replace(".", ","));

function Toggle({ name, label, description, defaultChecked, disabled }: { name: string; label: string; description?: string; defaultChecked: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(defaultChecked);
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <input type="hidden" name={name} value={on ? "on" : ""} />
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold">{label}</span>
        {description && <span className="block text-[13px] leading-snug text-muted-foreground">{description}</span>}
      </label>
      <Switch id={id} checked={on} onCheckedChange={setOn} disabled={disabled} />
    </div>
  );
}

/** Edição de um plano (preços, limites, recursos e IDs de preço do Stripe). */
export function PlanForm({ plan, stripeEnabled }: { plan: PlanRow; stripeEnabled: boolean }) {
  const id = useId();
  const router = useRouter();
  const { state, onSubmit, pending } = useActionForm(savePlanAction, idle);
  const free = plan.tier === "FREE";
  const err = (k: string) => fieldError(state, k);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Plano salvo.");
      router.refresh();
    }
  }, [state, router]);

  const f = (k: string) => `${id}-${k}`;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="tier" value={plan.tier} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor={f("name")} error={err("name")}>
          <Input id={f("name")} name="name" defaultValue={plan.name} maxLength={30} />
        </Field>
        <Field label="Frase curta" htmlFor={f("tagline")} error={err("tagline")}>
          <Input id={f("tagline")} name="tagline" defaultValue={plan.tagline} maxLength={120} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Preço mensal (R$)" htmlFor={f("pm")} error={err("priceMonthlyCents")}>
          <Input id={f("pm")} name="priceMonthlyCents" inputMode="decimal" defaultValue={money(plan.priceMonthlyCents)} disabled={free} />
        </Field>
        <Field label="Preço anual (R$)" htmlFor={f("py")} error={err("priceYearlyCents")} hint={free ? undefined : "Vazio = sem opção anual."}>
          <Input id={f("py")} name="priceYearlyCents" inputMode="decimal" defaultValue={money(plan.priceYearlyCents)} disabled={free} />
        </Field>
      </div>
      {free && (
        <>
          <input type="hidden" name="priceMonthlyCents" value="0" />
          <input type="hidden" name="priceYearlyCents" value="" />
        </>
      )}

      <div>
        <p className="text-sm font-semibold">Limites</p>
        <p className="mb-3 text-[13px] text-muted-foreground">Deixe eventos ativos ou locais vazios para ilimitado.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Field label="Eventos ativos" htmlFor={f("ev")} error={err("maxActiveEvents")}>
            <Input id={f("ev")} name="maxActiveEvents" type="number" inputMode="numeric" min={1} defaultValue={plan.maxActiveEvents ?? ""} placeholder="Ilimitado" />
          </Field>
          <Field label="Pessoas na equipe" htmlFor={f("mm")} error={err("maxMembers")}>
            <Input id={f("mm")} name="maxMembers" type="number" inputMode="numeric" min={1} defaultValue={plan.maxMembers} />
          </Field>
          <Field label="Locais salvos" htmlFor={f("vn")} error={err("maxVenues")}>
            <Input id={f("vn")} name="maxVenues" type="number" inputMode="numeric" min={1} defaultValue={plan.maxVenues ?? ""} placeholder="Ilimitado" />
          </Field>
          <Field label="Destaques por mês" htmlFor={f("bo")} error={err("boostsPerMonth")}>
            <Input id={f("bo")} name="boostsPerMonth" type="number" inputMode="numeric" min={0} defaultValue={plan.boostsPerMonth} />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-semibold">Recursos</p>
        <div className="divide-y divide-border">
          <Toggle name="fullAnalytics" label="Estatísticas completas" description="Gráficos diários e comparativos no painel." defaultChecked={plan.fullAnalytics} />
          <Toggle name="csvExport" label="Exportação em CSV" defaultChecked={plan.csvExport} />
          <Toggle name="highlightBadge" label="Selo de organizador profissional" defaultChecked={plan.highlightBadge} />
          <Toggle name="active" label="Disponível para contratação" description={free ? "O plano Gratuito é sempre o padrão." : "Desligado, não aparece na página de planos."} defaultChecked={plan.active} disabled={free} />
          {free && <input type="hidden" name="active" value="on" />}
        </div>
      </div>

      {!free && (
        <div>
          <p className="mb-2 text-sm font-semibold">Preços no Stripe</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ID do preço mensal" htmlFor={f("sm")} error={err("stripePriceMonthly")} hint={stripeEnabled ? "Ex.: price_1Q…" : "Stripe não configurado — o checkout fica desativado."}>
              <Input id={f("sm")} name="stripePriceMonthly" defaultValue={plan.stripePriceMonthly ?? ""} placeholder="price_…" className="font-mono text-sm" spellCheck={false} autoCapitalize="none" />
            </Field>
            <Field label="ID do preço anual" htmlFor={f("sy")} error={err("stripePriceYearly")}>
              <Input id={f("sy")} name="stripePriceYearly" defaultValue={plan.stripePriceYearly ?? ""} placeholder="price_…" className="font-mono text-sm" spellCheck={false} autoCapitalize="none" />
            </Field>
          </div>
        </div>
      )}

      <FormMessage state={state.status === "error" ? state : idle} />
      <div className="flex justify-end">
        <SubmitButton pending={pending} variant="primary" className="w-full sm:w-auto">
          Salvar {plan.name}
        </SubmitButton>
      </div>
    </form>
  );
}

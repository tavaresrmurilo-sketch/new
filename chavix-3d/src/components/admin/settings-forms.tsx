"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { changePassword } from "@/app/admin/actions/auth";
import { saveCustomBuilder, saveShipping, saveStoreInfo } from "@/app/admin/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { CustomBuilderConfig } from "@/lib/custom-builder";
import { centsToInput, parseBRL } from "@/lib/money";
import type { ShippingConfig } from "@/lib/shipping";
import { slugify } from "@/lib/text";
import { MoneyInput, Toggle } from "./form-bits";

function useSaver() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setSaving(true);
    const result = await action();
    setSaving(false);
    if (!result.ok) toast.error(result.error ?? "Não foi possível salvar");
    else {
      toast.success(success);
      router.refresh();
    }
    return result.ok;
  }
  return { saving, run };
}

function SaveBar({ saving, label = "Salvar" }: { saving: boolean; label?: string }) {
  return (
    <div className="flex justify-end border-t border-line pt-4">
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}

const cents = (value: string) => parseBRL(value || "0") ?? 0;
const centsOrNull = (value: string) => (value.trim() ? parseBRL(value) : null);

export function StoreInfoForm(props: {
  initial: { storeName: string; whatsappNumber: string; contactEmail: string; instagram: string; announcement: string; pickupAddress: string };
}) {
  const [v, setV] = useState(props.initial);
  const { saving, run } = useSaver();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(() => saveStoreInfo(v), "Dados da loja salvos"); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da loja" htmlFor="s-name">
          <Input id="s-name" value={v.storeName} onChange={set("storeName")} />
        </Field>
        <Field label="WhatsApp" htmlFor="s-wa" hint="Com DDD. Ex.: 62999998888. Ativa os botões de WhatsApp da loja.">
          <Input id="s-wa" inputMode="tel" value={v.whatsappNumber} onChange={set("whatsappNumber")} placeholder="62999998888" />
        </Field>
        <Field label="E-mail de contato" htmlFor="s-email" optional>
          <Input id="s-email" type="email" value={v.contactEmail} onChange={set("contactEmail")} />
        </Field>
        <Field label="Instagram" htmlFor="s-ig" optional>
          <Input id="s-ig" value={v.instagram} onChange={set("instagram")} placeholder="@chavix3d" />
        </Field>
      </div>
      <Field label="Faixa de aviso no topo" htmlFor="s-ann" optional hint="Deixe vazio para esconder">
        <Input id="s-ann" value={v.announcement} onChange={set("announcement")} maxLength={140} />
      </Field>
      <Field label="Endereço / instruções de retirada" htmlFor="s-pick" optional hint="Mostrado na página do pedido quando a entrega é Retirada">
        <Textarea id="s-pick" value={v.pickupAddress} onChange={set("pickupAddress")} maxLength={240} className="min-h-20" />
      </Field>
      <SaveBar saving={saving} />
    </form>
  );
}

export function ShippingForm({ initial }: { initial: ShippingConfig }) {
  const [pickup, setPickup] = useState(initial.pickup);
  const [local, setLocal] = useState({
    enabled: initial.local.enabled,
    price: centsToInput(initial.local.priceCents),
    freeAbove: centsToInput(initial.local.freeAboveCents),
    days: String(initial.local.estimatedDays),
    cities: initial.local.cities.join("\n"),
  });
  const [national, setNational] = useState({
    enabled: initial.national.enabled,
    price: centsToInput(initial.national.priceCents),
    freeAbove: centsToInput(initial.national.freeAboveCents),
    days: String(initial.national.estimatedDays),
  });
  const { saving, run } = useSaver();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: ShippingConfig = {
      pickup,
      local: {
        enabled: local.enabled,
        priceCents: cents(local.price),
        freeAboveCents: centsOrNull(local.freeAbove),
        estimatedDays: Number(local.days) || 0,
        cities: local.cities.split("\n").map((c) => c.trim()).filter(Boolean),
      },
      national: {
        enabled: national.enabled,
        priceCents: cents(national.price),
        freeAboveCents: centsOrNull(national.freeAbove),
        estimatedDays: Number(national.days) || 0,
      },
    };
    void run(() => saveShipping(payload), "Frete salvo");
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="rounded-lg border border-line p-4">
        <Toggle checked={pickup.enabled} onChange={(enabled) => setPickup((p) => ({ ...p, enabled }))} label="Retirada" description="Grátis. O cliente combina local e horário." />
        {pickup.enabled && (
          <Field label="Texto mostrado no checkout" htmlFor="sh-pick" className="mt-3">
            <Textarea id="sh-pick" value={pickup.instructions} onChange={(e) => setPickup((p) => ({ ...p, instructions: e.target.value }))} maxLength={500} className="min-h-16" />
          </Field>
        )}
      </div>

      <div className="rounded-lg border border-line p-4">
        <Toggle checked={local.enabled} onChange={(enabled) => setLocal((l) => ({ ...l, enabled }))} label="Entrega local" description="Só para as cidades listadas." />
        {local.enabled && (
          <div className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Valor" htmlFor="sh-l-price">
                <MoneyInput id="sh-l-price" value={local.price} onChange={(price) => setLocal((l) => ({ ...l, price }))} />
              </Field>
              <Field label="Grátis acima de" htmlFor="sh-l-free" optional>
                <MoneyInput id="sh-l-free" value={local.freeAbove} onChange={(freeAbove) => setLocal((l) => ({ ...l, freeAbove }))} />
              </Field>
              <Field label="Prazo (dias úteis)" htmlFor="sh-l-days">
                <Input id="sh-l-days" type="number" min={0} value={local.days} onChange={(e) => setLocal((l) => ({ ...l, days: e.target.value }))} />
              </Field>
            </div>
            <Field label="Cidades atendidas" htmlFor="sh-l-cities" hint="Uma por linha, no formato Cidade/UF. Ex.: Goiânia/GO">
              <Textarea id="sh-l-cities" value={local.cities} onChange={(e) => setLocal((l) => ({ ...l, cities: e.target.value }))} className="font-mono text-sm" />
            </Field>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-line p-4">
        <Toggle checked={national.enabled} onChange={(enabled) => setNational((n) => ({ ...n, enabled }))} label="Envio nacional" description="Valor fixo para todo o Brasil." />
        {national.enabled && (
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Valor" htmlFor="sh-n-price">
              <MoneyInput id="sh-n-price" value={national.price} onChange={(price) => setNational((n) => ({ ...n, price }))} />
            </Field>
            <Field label="Grátis acima de" htmlFor="sh-n-free" optional>
              <MoneyInput id="sh-n-free" value={national.freeAbove} onChange={(freeAbove) => setNational((n) => ({ ...n, freeAbove }))} />
            </Field>
            <Field label="Prazo (dias úteis)" htmlFor="sh-n-days">
              <Input id="sh-n-days" type="number" min={0} value={national.days} onChange={(e) => setNational((n) => ({ ...n, days: e.target.value }))} />
            </Field>
          </div>
        )}
      </div>
      <p className="text-xs text-muted">
        O frete grátis compara com o subtotal já com desconto. Para integrar uma transportadora (Correios, Melhor Envio…), implemente um provedor em
        <code className="mx-1 rounded bg-sunken px-1 font-mono">src/lib/shipping</code>.
      </p>
      <SaveBar saving={saving} />
    </form>
  );
}

export function CustomBuilderForm({ initial }: { initial: CustomBuilderConfig }) {
  const [v, setV] = useState({
    enabled: initial.enabled,
    base: centsToInput(initial.basePriceCents),
    productionDays: String(initial.productionDays),
    minQuantity: String(initial.minQuantity),
    maxQuantity: String(initial.maxQuantity),
    maxLength: String(initial.text.maxLength),
    includedChars: String(initial.text.includedChars),
    extraChar: centsToInput(initial.text.extraCharCents),
    referenceFee: centsToInput(initial.referenceSetupFeeCents),
  });
  const [shapes, setShapes] = useState(initial.shapes.map((s) => ({ ...s, price: centsToInput(s.priceCents) })));
  const [colors, setColors] = useState(initial.colors.map((c) => ({ ...c, price: centsToInput(c.priceCents) })));
  const [tiers, setTiers] = useState(initial.quantityTiers.map((t) => ({ minQuantity: String(t.minQuantity), percentOff: String(t.percentOff) })));
  const { saving, run } = useSaver();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: CustomBuilderConfig = {
      enabled: v.enabled,
      basePriceCents: cents(v.base),
      productionDays: Number(v.productionDays) || 1,
      minQuantity: Number(v.minQuantity) || 1,
      maxQuantity: Number(v.maxQuantity) || 1,
      text: { maxLength: Number(v.maxLength) || 1, includedChars: Number(v.includedChars) || 0, extraCharCents: cents(v.extraChar) },
      referenceSetupFeeCents: cents(v.referenceFee),
      shapes: shapes.map(({ price, ...s }) => ({ ...s, id: s.id || slugify(s.name).slice(0, 32), priceCents: cents(price) })),
      colors: colors.map(({ price, ...c }) => ({ ...c, id: c.id || slugify(c.name).slice(0, 32), priceCents: cents(price) })),
      quantityTiers: tiers.filter((t) => t.minQuantity && t.percentOff).map((t) => ({ minQuantity: Number(t.minQuantity), percentOff: Number(t.percentOff) })),
    };
    void run(() => saveCustomBuilder(payload), "Tabela do personalizado salva");
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Toggle checked={v.enabled} onChange={(enabled) => setV((x) => ({ ...x, enabled }))} label="Aceitar pedidos personalizados" description="Desligado: /personalizar mostra um aviso de pausa." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Preço base" htmlFor="cb-base">
          <MoneyInput id="cb-base" value={v.base} onChange={(base) => setV((x) => ({ ...x, base }))} />
        </Field>
        <Field label="Taxa de modelagem (referência)" htmlFor="cb-ref" hint="Cobrada uma vez por item">
          <MoneyInput id="cb-ref" value={v.referenceFee} onChange={(referenceFee) => setV((x) => ({ ...x, referenceFee }))} />
        </Field>
        <Field label="Prazo de produção (dias úteis)" htmlFor="cb-days">
          <Input id="cb-days" type="number" min={1} value={v.productionDays} onChange={(e) => setV((x) => ({ ...x, productionDays: e.target.value }))} />
        </Field>
        <Field label="Máx. caracteres do texto" htmlFor="cb-maxlen">
          <Input id="cb-maxlen" type="number" min={1} max={40} value={v.maxLength} onChange={(e) => setV((x) => ({ ...x, maxLength: e.target.value }))} />
        </Field>
        <Field label="Caracteres inclusos" htmlFor="cb-inc">
          <Input id="cb-inc" type="number" min={0} value={v.includedChars} onChange={(e) => setV((x) => ({ ...x, includedChars: e.target.value }))} />
        </Field>
        <Field label="Valor por caractere extra" htmlFor="cb-extra">
          <MoneyInput id="cb-extra" value={v.extraChar} onChange={(extraChar) => setV((x) => ({ ...x, extraChar }))} />
        </Field>
        <Field label="Quantidade mínima" htmlFor="cb-min">
          <Input id="cb-min" type="number" min={1} value={v.minQuantity} onChange={(e) => setV((x) => ({ ...x, minQuantity: e.target.value }))} />
        </Field>
        <Field label="Quantidade máxima" htmlFor="cb-max">
          <Input id="cb-max" type="number" min={1} value={v.maxQuantity} onChange={(e) => setV((x) => ({ ...x, maxQuantity: e.target.value }))} />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Formatos</p>
        <div className="space-y-2">
          {shapes.map((s, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1.4fr_130px_auto]">
              <Input value={s.name} aria-label="Nome do formato" placeholder="Nome" onChange={(e) => setShapes((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input value={s.description} aria-label="Descrição" placeholder="Descrição" onChange={(e) => setShapes((arr) => arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <MoneyInput value={s.price} aria-label="Adicional" onChange={(price) => setShapes((arr) => arr.map((x, j) => (j === i ? { ...x, price } : x)))} />
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={s.requiresReference} onChange={(e) => setShapes((arr) => arr.map((x, j) => (j === i ? { ...x, requiresReference: e.target.checked } : x)))} className="accent-[var(--color-accent)]" /> exige imagem</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={s.active} onChange={(e) => setShapes((arr) => arr.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} className="accent-[var(--color-accent)]" /> ativo</label>
                <button type="button" aria-label="Remover formato" onClick={() => setShapes((arr) => arr.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setShapes((arr) => [...arr, { id: "", name: "", description: "", priceCents: 0, price: "", requiresReference: false, active: true }])}>
          <Plus className="h-4 w-4" /> Formato
        </Button>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Cores de filamento</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {colors.map((c, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr_110px_auto] items-center gap-2 rounded-lg border border-line p-2">
              <input type="color" value={c.hex} aria-label="Cor" onChange={(e) => setColors((arr) => arr.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} className="h-10 w-10 rounded border border-line-strong p-0.5" />
              <Input value={c.name} aria-label="Nome da cor" onChange={(e) => setColors((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <MoneyInput value={c.price} aria-label="Adicional da cor" onChange={(price) => setColors((arr) => arr.map((x, j) => (j === i ? { ...x, price } : x)))} />
              <div className="flex items-center gap-1">
                <input type="checkbox" checked={c.active} aria-label="Ativa" onChange={(e) => setColors((arr) => arr.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} className="accent-[var(--color-accent)]" />
                <button type="button" aria-label="Remover cor" onClick={() => setColors((arr) => arr.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setColors((arr) => [...arr, { id: "", name: "", hex: "#5b3df5", priceCents: 0, price: "", active: true }])}>
          <Plus className="h-4 w-4" /> Cor
        </Button>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Desconto por quantidade</p>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              A partir de
              <Input className="h-9 w-20" type="number" min={2} value={t.minQuantity} aria-label="Quantidade mínima" onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, minQuantity: e.target.value } : x)))} />
              unidades:
              <Input className="h-9 w-20" type="number" min={1} max={60} value={t.percentOff} aria-label="Percentual" onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, percentOff: e.target.value } : x)))} />
              % off
              <button type="button" aria-label="Remover faixa" onClick={() => setTiers((arr) => arr.filter((_, j) => j !== i))} className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setTiers((arr) => [...arr, { minQuantity: "", percentOff: "" }])}>
          <Plus className="h-4 w-4" /> Faixa
        </Button>
      </div>
      <SaveBar saving={saving} />
    </form>
  );
}

export function PasswordForm() {
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const { saving, run } = useSaver();
  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => changePassword(v), "Senha alterada. Outras sessões foram encerradas.");
        if (ok) setV({ current: "", next: "", confirm: "" });
      }}
    >
      <Field label="Senha atual" htmlFor="pw-cur">
        <Input id="pw-cur" type="password" autoComplete="current-password" value={v.current} onChange={(e) => setV((x) => ({ ...x, current: e.target.value }))} />
      </Field>
      <Field label="Nova senha" htmlFor="pw-new" hint="Mínimo de 10 caracteres, com letras e números">
        <Input id="pw-new" type="password" autoComplete="new-password" value={v.next} onChange={(e) => setV((x) => ({ ...x, next: e.target.value }))} />
      </Field>
      <Field label="Confirme a nova senha" htmlFor="pw-conf">
        <Input id="pw-conf" type="password" autoComplete="new-password" value={v.confirm} onChange={(e) => setV((x) => ({ ...x, confirm: e.target.value }))} />
      </Field>
      <Button type="submit" disabled={saving || !v.current || !v.next}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Alterar senha
      </Button>
    </form>
  );
}

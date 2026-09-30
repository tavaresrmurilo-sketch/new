"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { deleteCoupon, saveCoupon, toggleCoupon } from "@/app/admin/actions/catalog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { centsToInput, formatBRL, parseBRL } from "@/lib/money";
import { cn } from "@/lib/cn";
import { MoneyInput, Toggle } from "./form-bits";

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENT" | "FIXED";
  value: number;
  minSubtotalCents: number | null;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  firstPurchaseOnly: boolean;
}

interface Draft {
  id?: string;
  code: string;
  description: string;
  type: "PERCENT" | "FIXED";
  value: string;
  minSubtotal: string;
  maxUses: string;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  firstPurchaseOnly: boolean;
}

const EMPTY: Draft = { code: "", description: "", type: "PERCENT", value: "10", minSubtotal: "", maxUses: "", startsAt: "", expiresAt: "", active: false, firstPurchaseOnly: false };

function describe(c: CouponRow) {
  const value = c.type === "PERCENT" ? `${c.value}%` : formatBRL(c.value);
  const rules = [c.minSubtotalCents ? `mín. ${formatBRL(c.minSubtotalCents)}` : null, c.firstPurchaseOnly ? "1ª compra" : null].filter(Boolean);
  return `${value} de desconto${rules.length ? ` · ${rules.join(" · ")}` : ""}`;
}

export function CouponManager({ coupons }: { coupons: CouponRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function edit(c: CouponRow) {
    setErrors({});
    setDraft({
      id: c.id,
      code: c.code,
      description: c.description ?? "",
      type: c.type,
      value: c.type === "PERCENT" ? String(c.value) : centsToInput(c.value),
      minSubtotal: centsToInput(c.minSubtotalCents),
      maxUses: c.maxUses?.toString() ?? "",
      startsAt: c.startsAt ?? "",
      expiresAt: c.expiresAt ?? "",
      active: c.active,
      firstPurchaseOnly: c.firstPurchaseOnly,
    });
  }

  async function save() {
    if (!draft) return;
    const value = draft.type === "PERCENT" ? Number(draft.value) : parseBRL(draft.value);
    if (!value || value <= 0) {
      setErrors({ value: "Informe o valor do desconto" });
      return;
    }
    setSaving(true);
    const result = await saveCoupon({
      id: draft.id,
      code: draft.code,
      description: draft.description,
      type: draft.type,
      value: Math.round(value),
      minSubtotalCents: draft.minSubtotal.trim() ? parseBRL(draft.minSubtotal) : null,
      maxUses: draft.maxUses.trim() ? Number(draft.maxUses) : null,
      startsAt: draft.startsAt || null,
      expiresAt: draft.expiresAt || null,
      active: draft.active,
      firstPurchaseOnly: draft.firstPurchaseOnly,
    });
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fields ?? {});
      toast.error(result.error);
      return;
    }
    toast.success("Cupom salvo");
    setDraft(null);
    router.refresh();
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => { setErrors({}); setDraft(EMPTY); }}>
          <Plus className="h-4 w-4" /> Novo cupom
        </Button>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {coupons.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono font-semibold">{c.code}</p>
              <p className="text-sm text-muted">{describe(c)}</p>
              <p className="text-xs text-muted">
                {c.usedCount} uso(s){c.maxUses ? ` de ${c.maxUses}` : ""}
                {c.expiresAt && ` · até ${c.expiresAt.split("-").reverse().join("/")}`}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={c.active}
              aria-label={`Ativar ${c.code}`}
              onClick={async () => {
                await toggleCoupon(c.id, !c.active);
                router.refresh();
              }}
              className={cn("relative h-6 w-11 rounded-full transition-colors", c.active ? "bg-accent" : "bg-line-strong")}
            >
              <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", c.active && "translate-x-5")} />
            </button>
            <button type="button" aria-label={`Editar ${c.code}`} onClick={() => edit(c)} className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-sunken">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Excluir ${c.code}`}
              onClick={async () => {
                if (!window.confirm(`Excluir o cupom ${c.code}?`)) return;
                const result = await deleteCoupon(c.id);
                if (!result.ok) toast.message(result.error);
                router.refresh();
              }}
              className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
        {coupons.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Nenhum cupom cadastrado.</li>}
      </ul>

      <Sheet
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? "Editar cupom" : "Novo cupom"}
        footer={
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar cupom
          </Button>
        }
      >
        {draft && (
          <div className="space-y-4 py-5">
            <Field label="Código" htmlFor="cp-code" error={errors.code}>
              <Input id="cp-code" value={draft.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/\s/g, ""))} className="font-mono uppercase" placeholder="CHAVIX10" />
            </Field>
            <Field label="Descrição interna" htmlFor="cp-desc" optional>
              <Input id="cp-desc" value={draft.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo" htmlFor="cp-type">
                <Select id="cp-type" value={draft.type} onChange={(e) => set("type", e.target.value as Draft["type"])}>
                  <option value="PERCENT">Percentual</option>
                  <option value="FIXED">Valor fixo</option>
                </Select>
              </Field>
              <Field label={draft.type === "PERCENT" ? "Percentual (%)" : "Valor"} htmlFor="cp-value" error={errors.value}>
                {draft.type === "PERCENT" ? (
                  <Input id="cp-value" type="number" min={1} max={100} value={draft.value} onChange={(e) => set("value", e.target.value)} />
                ) : (
                  <MoneyInput id="cp-value" value={draft.value} onChange={(v) => set("value", v)} />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Compra mínima" htmlFor="cp-min" optional error={errors.minSubtotalCents}>
                <MoneyInput id="cp-min" value={draft.minSubtotal} onChange={(v) => set("minSubtotal", v)} />
              </Field>
              <Field label="Limite de usos" htmlFor="cp-max" optional error={errors.maxUses}>
                <Input id="cp-max" type="number" min={1} value={draft.maxUses} onChange={(e) => set("maxUses", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Válido a partir de" htmlFor="cp-start" optional>
                <Input id="cp-start" type="date" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
              </Field>
              <Field label="Válido até" htmlFor="cp-end" optional error={errors.expiresAt}>
                <Input id="cp-end" type="date" value={draft.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
              </Field>
            </div>
            <div className="divide-y divide-line">
              <Toggle checked={draft.firstPurchaseOnly} onChange={(v) => set("firstPurchaseOnly", v)} label="Só na primeira compra" description="Confere pelo e-mail e telefone do cliente" />
              <Toggle checked={draft.active} onChange={(v) => set("active", v)} label="Ativo" />
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { saveProduct } from "@/app/admin/actions/products";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { centsToInput, parseBRL } from "@/lib/money";
import { slugify } from "@/lib/text";
import { FormSection, MoneyInput, Toggle } from "./form-bits";

export interface ProductFormValue {
  id?: string;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  promoPriceCents: number | null;
  stock: number;
  allowBackorder: boolean;
  active: boolean;
  featured: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  minQuantity: number;
  maxQuantity: number;
  widthMm: number | null;
  heightMm: number | null;
  depthMm: number | null;
  weightGrams: number | null;
  material: string;
  productionDays: number;
  variants: Array<{ id?: string; name: string; colorHex: string; priceDeltaCents: number; active: boolean }>;
  customizations: Array<{
    id?: string;
    label: string;
    type: "TEXT" | "SELECT";
    required: boolean;
    placeholder: string;
    maxLength: number | null;
    priceCents: number;
    options: Array<{ label: string; priceCents: number }>;
  }>;
}

const PRESET_COLORS = [
  ["Grafite", "#23232b"],
  ["Branco gelo", "#f2f2ef"],
  ["Cinza concreto", "#8b8b93"],
  ["Violeta elétrico", "#6a4cff"],
  ["Azul cobalto", "#2d62d8"],
  ["Vermelho", "#d23b3b"],
  ["Verde folha", "#2f9a5b"],
  ["Amarelo", "#f1c232"],
  ["Rosa chiclete", "#ec72a8"],
  ["Laranja", "#f07a2a"],
  ["Seda dourada", "#c9a14a"],
];

const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

function optionsToText(options: Array<{ label: string; priceCents: number }>) {
  return options.map((o) => (o.priceCents ? `${o.label} | ${centsToInput(o.priceCents)}` : o.label)).join("\n");
}
function textToOptions(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, price] = line.split("|").map((s) => s.trim());
      return { label, priceCents: price ? (parseBRL(price) ?? 0) : 0 };
    });
}

export function ProductForm({ initial, categories }: { initial: ProductFormValue | null; categories: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [v, setV] = useState<ProductFormValue>(
    initial ?? {
      name: "",
      slug: "",
      sku: "",
      categoryId: categories[0]?.id ?? "",
      shortDescription: "",
      description: "",
      priceCents: 0,
      promoPriceCents: null,
      stock: 0,
      allowBackorder: true,
      active: true,
      featured: false,
      isNew: true,
      isBestSeller: false,
      minQuantity: 1,
      maxQuantity: 50,
      widthMm: null,
      heightMm: null,
      depthMm: null,
      weightGrams: null,
      material: "PLA",
      productionDays: 3,
      variants: [],
      customizations: [],
    },
  );
  const [price, setPrice] = useState(initial ? centsToInput(initial.priceCents) : "");
  const [promo, setPromo] = useState(initial?.promoPriceCents != null ? centsToInput(initial.promoPriceCents) : "");
  const [measures, setMeasures] = useState({
    widthMm: initial?.widthMm?.toString() ?? "",
    heightMm: initial?.heightMm?.toString() ?? "",
    depthMm: initial?.depthMm?.toString() ?? "",
    weightGrams: initial?.weightGrams?.toString() ?? "",
  });
  const [variantPrices, setVariantPrices] = useState(v.variants.map((x) => centsToInput(x.priceDeltaCents)));
  const [customPrices, setCustomPrices] = useState(v.customizations.map((x) => centsToInput(x.priceCents)));
  const [optionTexts, setOptionTexts] = useState(v.customizations.map((x) => optionsToText(x.options)));
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ProductFormValue>(key: K, value: ProductFormValue[K]) => setV((prev) => ({ ...prev, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = parseBRL(price);
    const promoCents = promo.trim() ? parseBRL(promo) : null;
    if (priceCents == null) {
      setErrors({ priceCents: "Preço inválido" });
      toast.error("Preço inválido");
      return;
    }
    const payload = {
      ...v,
      priceCents,
      promoPriceCents: promoCents,
      widthMm: numOrNull(measures.widthMm),
      heightMm: numOrNull(measures.heightMm),
      depthMm: numOrNull(measures.depthMm),
      weightGrams: numOrNull(measures.weightGrams),
      variants: v.variants.map((variant, i) => ({ ...variant, priceDeltaCents: parseBRL(variantPrices[i] || "0") ?? 0 })),
      customizations: v.customizations.map((c, i) => ({ ...c, priceCents: parseBRL(customPrices[i] || "0") ?? 0, options: textToOptions(optionTexts[i] ?? "") })),
    };
    setSaving(true);
    const result = await saveProduct(payload);
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fields ?? {});
      toast.error(result.error);
      return;
    }
    setErrors({});
    if (!initial) {
      toast.success("Produto criado. Agora adicione as fotos.");
      router.push(`/admin/produtos/${result.id}`);
    } else {
      toast.success("Produto salvo");
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-line bg-surface p-5 sm:p-8">
      <FormSection title="Informações" description="Nome, endereço da página e textos que aparecem na loja.">
        <Field label="Nome" htmlFor="p-name" error={errors.name}>
          <Input
            id="p-name"
            value={v.name}
            onChange={(e) => {
              const name = e.target.value;
              setV((prev) => ({ ...prev, name, slug: slugTouched ? prev.slug : slugify(name) }));
            }}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Endereço (slug)" htmlFor="p-slug" error={errors.slug} hint={`/produto/${v.slug || "…"}`}>
            <Input id="p-slug" value={v.slug} onChange={(e) => { setSlugTouched(true); set("slug", slugify(e.target.value)); }} className="font-mono text-sm" aria-invalid={Boolean(errors.slug)} />
          </Field>
          <Field label="SKU" htmlFor="p-sku" error={errors.sku}>
            <Input id="p-sku" value={v.sku} onChange={(e) => set("sku", e.target.value.toUpperCase())} className="font-mono text-sm" placeholder="CHX-GAM-010" aria-invalid={Boolean(errors.sku)} />
          </Field>
        </div>
        <Field label="Categoria" htmlFor="p-cat" error={errors.categoryId}>
          <Select id="p-cat" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descrição curta" htmlFor="p-short" error={errors.shortDescription} hint={`${v.shortDescription.length}/160 · aparece nos cards e no Google`}>
          <Input id="p-short" value={v.shortDescription} maxLength={160} onChange={(e) => set("shortDescription", e.target.value)} aria-invalid={Boolean(errors.shortDescription)} />
        </Field>
        <Field label="Descrição" htmlFor="p-desc" error={errors.description} hint="Texto simples. Deixe uma linha em branco entre parágrafos.">
          <Textarea id="p-desc" value={v.description} onChange={(e) => set("description", e.target.value)} className="min-h-36" aria-invalid={Boolean(errors.description)} />
        </Field>
      </FormSection>

      <FormSection title="Preço e estoque" description="Valores em reais. O preço promocional só vale se for menor que o cheio.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preço" htmlFor="p-price" error={errors.priceCents}>
            <MoneyInput id="p-price" value={price} onChange={setPrice} placeholder="0,00" aria-invalid={Boolean(errors.priceCents)} />
          </Field>
          <Field label="Preço promocional" htmlFor="p-promo" optional error={errors.promoPriceCents}>
            <MoneyInput id="p-promo" value={promo} onChange={setPromo} placeholder="0,00" aria-invalid={Boolean(errors.promoPriceCents)} />
          </Field>
          <Field label="Estoque (pronta entrega)" htmlFor="p-stock" error={errors.stock}>
            <Input id="p-stock" type="number" min={0} value={v.stock} onChange={(e) => set("stock", Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label="Prazo de produção (dias úteis)" htmlFor="p-days" error={errors.productionDays}>
            <Input id="p-days" type="number" min={0} value={v.productionDays} onChange={(e) => set("productionDays", Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label="Quantidade mínima por pedido" htmlFor="p-min" error={errors.minQuantity}>
            <Input id="p-min" type="number" min={1} value={v.minQuantity} onChange={(e) => set("minQuantity", Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          <Field label="Quantidade máxima por pedido" htmlFor="p-max" error={errors.maxQuantity}>
            <Input id="p-max" type="number" min={1} value={v.maxQuantity} onChange={(e) => set("maxQuantity", Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        </div>
        <Toggle checked={v.allowBackorder} onChange={(x) => set("allowBackorder", x)} label="Aceitar pedidos sem estoque (sob encomenda)" description="Desligado: o produto aparece como esgotado quando o estoque zera." />
      </FormSection>

      <FormSection title="Ficha técnica" description="Aparece na página do produto.">
        <div className="grid gap-4 sm:grid-cols-3">
          {(["widthMm", "heightMm", "depthMm"] as const).map((key, i) => (
            <Field key={key} label={["Largura (mm)", "Altura (mm)", "Espessura (mm)"][i]} htmlFor={`p-${key}`} optional>
              <Input id={`p-${key}`} inputMode="decimal" value={measures[key]} onChange={(e) => setMeasures((m) => ({ ...m, [key]: e.target.value.replace(/[^\d.,]/g, "") }))} />
            </Field>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Peso (g)" htmlFor="p-weight" optional>
            <Input id="p-weight" inputMode="decimal" value={measures.weightGrams} onChange={(e) => setMeasures((m) => ({ ...m, weightGrams: e.target.value.replace(/[^\d.,]/g, "") }))} />
          </Field>
          <Field label="Material" htmlFor="p-material" error={errors.material} className="sm:col-span-2">
            <Input id="p-material" value={v.material} onChange={(e) => set("material", e.target.value)} list="materials" />
            <datalist id="materials">
              <option value="PLA" />
              <option value="PETG" />
              <option value="PLA Silk" />
              <option value="TPU" />
              <option value="ABS" />
            </datalist>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Cores disponíveis" description="Cada cor pode ter um adicional (ex.: filamentos especiais). Sem cores, o cliente não escolhe cor.">
        {v.variants.map((variant, i) => (
          <div key={variant.id ?? `new-${i}`} className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-line p-3 sm:grid-cols-[auto_1fr_150px_auto]">
            <input
              type="color"
              value={variant.colorHex}
              aria-label="Cor"
              onChange={(e) => set("variants", v.variants.map((x, j) => (j === i ? { ...x, colorHex: e.target.value } : x)))}
              className="h-11 w-11 cursor-pointer rounded-md border border-line-strong bg-surface p-1"
            />
            <Input value={variant.name} placeholder="Nome da cor" aria-label="Nome da cor" onChange={(e) => set("variants", v.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <MoneyInput value={variantPrices[i] ?? ""} onChange={(val) => setVariantPrices((p) => p.map((x, j) => (j === i ? val : x)))} placeholder="0,00" aria-label="Adicional da cor" className="col-span-2 sm:col-span-1" />
            <div className="col-span-2 flex items-center justify-end gap-1 sm:col-span-1">
              <label className="mr-2 flex items-center gap-1.5 text-xs text-muted">
                <input type="checkbox" checked={variant.active} onChange={(e) => set("variants", v.variants.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} className="accent-[var(--color-accent)]" />
                ativa
              </label>
              <button type="button" aria-label="Remover cor" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" onClick={() => { set("variants", v.variants.filter((_, j) => j !== i)); setVariantPrices((p) => p.filter((_, j) => j !== i)); }}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {errors[`variants.0.name`] && <p className="text-sm text-danger">Dê nome a todas as cores.</p>}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.filter(([name]) => !v.variants.some((x) => x.name === name)).map(([name, hex]) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                set("variants", [...v.variants, { name, colorHex: hex, priceDeltaCents: 0, active: true }]);
                setVariantPrices((p) => [...p, ""]);
              }}
              className="flex items-center gap-1.5 rounded-full border border-line py-1 pr-2.5 pl-1 text-xs hover:border-ink/30"
            >
              <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: hex }} />+ {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              set("variants", [...v.variants, { name: "", colorHex: "#5b3df5", priceDeltaCents: 0, active: true }]);
              setVariantPrices((p) => [...p, ""]);
            }}
            className="flex items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs hover:border-ink/40"
          >
            <Plus className="h-3 w-3" /> Outra cor
          </button>
        </div>
      </FormSection>

      <FormSection title="Personalizações" description="Campos que o cliente preenche no produto, como nome gravado. Valores adicionais são somados no servidor.">
        {v.customizations.map((c, i) => (
          <div key={c.id ?? `new-${i}`} className="space-y-3 rounded-lg border border-line p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <Field label="Nome do campo" htmlFor={`c-label-${i}`} error={errors[`customizations.${i}.label`]}>
                <Input id={`c-label-${i}`} value={c.label} placeholder="Ex.: Nome gravado" onChange={(e) => set("customizations", v.customizations.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              </Field>
              <Field label="Tipo" htmlFor={`c-type-${i}`}>
                <Select id={`c-type-${i}`} value={c.type} onChange={(e) => set("customizations", v.customizations.map((x, j) => (j === i ? { ...x, type: e.target.value as "TEXT" | "SELECT" } : x)))}>
                  <option value="TEXT">Texto livre</option>
                  <option value="SELECT">Lista de opções</option>
                </Select>
              </Field>
            </div>
            {c.type === "TEXT" ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Exemplo (placeholder)" htmlFor={`c-ph-${i}`} optional>
                  <Input id={`c-ph-${i}`} value={c.placeholder} onChange={(e) => set("customizations", v.customizations.map((x, j) => (j === i ? { ...x, placeholder: e.target.value } : x)))} />
                </Field>
                <Field label="Máx. caracteres" htmlFor={`c-max-${i}`}>
                  <Input id={`c-max-${i}`} type="number" min={1} max={80} value={c.maxLength ?? 20} onChange={(e) => set("customizations", v.customizations.map((x, j) => (j === i ? { ...x, maxLength: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                </Field>
                <Field label="Valor adicional" htmlFor={`c-price-${i}`}>
                  <MoneyInput id={`c-price-${i}`} value={customPrices[i] ?? ""} onChange={(val) => setCustomPrices((p) => p.map((x, j) => (j === i ? val : x)))} placeholder="0,00" />
                </Field>
              </div>
            ) : (
              <Field label="Opções" htmlFor={`c-opts-${i}`} hint="Uma por linha. Para cobrar a mais: Mosquetão | 3,00" error={errors[`customizations.${i}.options`]}>
                <Textarea id={`c-opts-${i}`} value={optionTexts[i] ?? ""} onChange={(e) => setOptionTexts((p) => p.map((x, j) => (j === i ? e.target.value : x)))} className="font-mono text-sm" />
              </Field>
            )}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={c.required} onChange={(e) => set("customizations", v.customizations.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} className="accent-[var(--color-accent)]" />
                Obrigatório
              </label>
              <div className="flex gap-1">
                <button type="button" aria-label="Subir" disabled={i === 0} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken disabled:opacity-30" onClick={() => {
                  const move = <T,>(arr: T[]) => { const a = [...arr]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; };
                  set("customizations", move(v.customizations)); setCustomPrices(move); setOptionTexts(move);
                }}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Descer" disabled={i === v.customizations.length - 1} className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-sunken disabled:opacity-30" onClick={() => {
                  const move = <T,>(arr: T[]) => { const a = [...arr]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a; };
                  set("customizations", move(v.customizations)); setCustomPrices(move); setOptionTexts(move);
                }}>
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Remover personalização" className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" onClick={() => {
                  set("customizations", v.customizations.filter((_, j) => j !== i));
                  setCustomPrices((p) => p.filter((_, j) => j !== i));
                  setOptionTexts((p) => p.filter((_, j) => j !== i));
                }}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            set("customizations", [...v.customizations, { label: "", type: "TEXT", required: false, placeholder: "", maxLength: 12, priceCents: 0, options: [] }]);
            setCustomPrices((p) => [...p, ""]);
            setOptionTexts((p) => [...p, ""]);
          }}
        >
          <Plus className="h-4 w-4" /> Adicionar personalização
        </Button>
      </FormSection>

      <FormSection title="Visibilidade e destaques">
        <div className="divide-y divide-line">
          <Toggle checked={v.active} onChange={(x) => set("active", x)} label="Ativo na loja" description="Desligado: some da loja, mas continua nos pedidos antigos." />
          <Toggle checked={v.featured} onChange={(x) => set("featured", x)} label="Destaque" description="Pode aparecer na abertura da home." />
          <Toggle checked={v.isNew} onChange={(x) => set("isNew", x)} label="Lançamento" description="Aparece na prateleira de lançamentos." />
          <Toggle checked={v.isBestSeller} onChange={(x) => set("isBestSeller", x)} label="Mais vendido" description="Além do ranking automático por vendas confirmadas." />
        </div>
      </FormSection>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:-mb-8 sm:px-8">
        <Button variant="ghost" onClick={() => router.push("/admin/produtos")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? "Salvar alterações" : "Criar produto"}
        </Button>
      </div>
    </form>
  );
}

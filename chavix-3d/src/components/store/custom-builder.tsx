"use client";

import { ImagePlus, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { QuantityStepper } from "@/components/ui/quantity";
import { quoteCustomKeychain, type CustomBuilderConfig } from "@/lib/custom-builder";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useCart } from "./cart-provider";
import { CustomPreview } from "./custom-preview";
import { ShapeIcon } from "./shape-icon";

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-7 first:pt-0 last:border-0">
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-sm text-accent">{String(n).padStart(2, "0")}</span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function CustomBuilder({ config, whatsappHref }: { config: CustomBuilderConfig; whatsappHref: string | null }) {
  const { addCustom } = useCart();
  const shapes = config.shapes.filter((s) => s.active);
  const colors = config.colors.filter((c) => c.active);
  const [shapeId, setShapeId] = useState(shapes[0]?.id ?? "");
  const [colorId, setColorId] = useState(colors.find((c) => c.id === "violeta")?.id ?? colors[0]?.id ?? "");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [quantity, setQuantity] = useState(config.minQuantity);
  const [reference, setReference] = useState<{ id: string; url: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const shape = shapes.find((s) => s.id === shapeId);
  const color = colors.find((c) => c.id === colorId);
  const quote = useMemo(
    () => quoteCustomKeychain(config, { shapeId, colorId, text, notes, quantity }, Boolean(reference)),
    [config, shapeId, colorId, text, notes, quantity, reference],
  );

  async function upload(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      toast.error("A imagem precisa ter até 4 MB");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads/reference", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no envio");
      setReference({ id: data.id, url: data.url, name: file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a imagem");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function add() {
    if (!quote.ok) {
      toast.error(quote.error);
      return;
    }
    setAdding(true);
    const ok = await addCustom({ selection: { shapeId, colorId, text, notes, quantity }, referenceFileId: reference?.id ?? null });
    setAdding(false);
    if (ok) {
      setText("");
      setNotes("");
      setReference(null);
      setQuantity(config.minQuantity);
    }
  }

  const nextTier = config.quantityTiers
    .filter((t) => t.minQuantity > quantity)
    .sort((a, b) => a.minQuantity - b.minQuantity)[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
      {/* Prévia + estimativa */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="layers-ink overflow-hidden rounded-2xl border border-line bg-sunken">
          <div className="flex items-center justify-between px-4 pt-3">
            <span className="spec text-muted">Prévia ilustrativa</span>
            <span className="spec text-muted">{shape?.name} · {color?.name}</span>
          </div>
          <div className="px-6 pt-2 pb-6 sm:px-12">
            <CustomPreview shapeId={shapeId} color={color?.hex ?? "#5b3df5"} text={text} />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-surface p-5" aria-live="polite">
          <div className="flex items-baseline justify-between">
            <p className="font-medium">Estimativa</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{quote.ok ? formatBRL(quote.totalCents) : "—"}</p>
          </div>
          {quote.ok ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              {quote.breakdown.map((line) => (
                <div key={line.label} className="flex justify-between text-muted">
                  <dt>{line.label}</dt>
                  <dd className="tabular-nums">{formatBRL(line.cents)}</dd>
                </div>
              ))}
              {quote.percentOff > 0 && (
                <div className="flex justify-between text-success">
                  <dt>Desconto por quantidade</dt>
                  <dd>−{quote.percentOff}%</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-1.5 text-ink-2">
                <dt>
                  {quantity} × {formatBRL(quote.unitPriceCents)}
                </dt>
                <dd className="tabular-nums">{formatBRL(quote.unitPriceCents * quantity)}</dd>
              </div>
              {quote.setupFeeCents > 0 && (
                <div className="flex justify-between text-ink-2">
                  <dt>Modelagem da referência (taxa única)</dt>
                  <dd className="tabular-nums">{formatBRL(quote.setupFeeCents)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted">{quote.error}</p>
          )}
          <p className="mt-4 flex gap-2 rounded-lg bg-accent-soft p-3 text-sm text-ink-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <span>
              <strong className="font-semibold text-ink">Pedidos personalizados passam por análise antes da produção.</strong> Se algo precisar de ajuste, a gente fala com você antes de imprimir.
            </span>
          </p>
          <Button size="lg" className="mt-4 hidden w-full lg:flex" onClick={add} disabled={!quote.ok || adding}>
            {adding && <Loader2 className="h-4 w-4 animate-spin" />}
            Adicionar ao carrinho
          </Button>
          <p className="mt-3 text-center text-xs text-muted">Produção em até {config.productionDays} dias úteis após o pagamento.</p>
        </div>
      </div>

      {/* Passos */}
      <div>
        <Step n={1} title="Escolha o formato">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Formato">
            {shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={s.id === shapeId}
                onClick={() => setShapeId(s.id)}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-xl border bg-surface p-3 text-left transition-colors",
                  s.id === shapeId ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink/30",
                )}
              >
                <ShapeIcon shapeId={s.id} color={s.id === shapeId ? color?.hex : "#9a9aa6"} className="h-10 w-10" />
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs leading-snug text-muted">{s.description}</span>
                <span className="mt-auto text-xs font-medium text-ink-2">{s.priceCents > 0 ? `+${formatBRL(s.priceCents)}` : "Incluso"}</span>
              </button>
            ))}
          </div>
        </Step>

        <Step n={2} title="Escolha a cor" hint={color ? `${color.name}${color.priceCents ? ` · +${formatBRL(color.priceCents)}` : ""}` : undefined}>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Cor">
            {colors.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === colorId}
                title={`${c.name}${c.priceCents ? ` (+${formatBRL(c.priceCents)})` : ""}`}
                onClick={() => setColorId(c.id)}
                className={cn("h-10 w-10 rounded-full ring-1 ring-black/10 transition-shadow", c.id === colorId && "ring-2 ring-accent ring-offset-2 ring-offset-canvas")}
                style={{ background: c.hex }}
              >
                <span className="sr-only">{c.name}</span>
              </button>
            ))}
          </div>
        </Step>

        <Step
          n={3}
          title="Escreva o nome ou texto"
          hint={`Até ${config.text.maxLength} caracteres. ${config.text.includedChars} inclusos${config.text.extraCharCents ? `, depois ${formatBRL(config.text.extraCharCents)} por caractere` : ""}.`}
        >
          <div className="relative">
            <input
              id="custom-text"
              value={text}
              maxLength={config.text.maxLength}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: Maria, Time 10, Casa da Vó"
              className="h-12 w-full rounded-md border border-line-strong bg-surface px-4 pr-16 text-base focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
              aria-label="Nome ou texto"
            />
            <span className="absolute top-1/2 right-4 -translate-y-1/2 font-mono text-xs text-muted tabular-nums">
              {text.length}/{config.text.maxLength}
            </span>
          </div>
        </Step>

        <Step
          n={4}
          title="Imagem de referência"
          hint={`Opcional. Um desenho, foto ou rascunho da ideia. JPG, PNG ou WebP até 4 MB.${config.referenceSetupFeeCents ? ` Modelagem: ${formatBRL(config.referenceSetupFeeCents)} (taxa única).` : ""}`}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            id="custom-reference"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {reference ? (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <img src={reference.url} alt="Referência enviada" className="h-16 w-16 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{reference.name}</p>
                <p className="text-xs text-muted">Enviada. Só a equipe CHAVIX vê esta imagem.</p>
              </div>
              <button type="button" onClick={() => setReference(null)} className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" aria-label="Remover referência">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="custom-reference"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface p-4 text-sm transition-colors hover:border-ink/40",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin text-muted" /> : <ImagePlus className="h-5 w-5 text-muted" />}
              <span>
                <span className="font-medium">{uploading ? "Enviando…" : "Enviar imagem"}</span>
                <span className="block text-xs text-muted">Não use imagens de personagens ou marcas de terceiros.</span>
              </span>
            </label>
          )}
        </Step>

        <Step n={5} title="Observações" hint="Opcional. Fonte, posição do texto, ocasião, prazo…">
          <Textarea id="custom-notes" value={notes} maxLength={600} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: letras em branco, para lembrancinha de aniversário." aria-label="Observações" />
        </Step>

        <Step n={6} title="Quantidade" hint={nextTier ? `A partir de ${nextTier.minQuantity} unidades: ${nextTier.percentOff}% de desconto em cada.` : undefined}>
          <QuantityStepper value={quantity} min={config.minQuantity} max={config.maxQuantity} onChange={setQuantity} />
        </Step>

        {whatsappHref && (
          <p className="pt-2 text-sm text-muted">
            Ideia mais complexa?{" "}
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
              Quero um personalizado — falar no WhatsApp
            </a>
          </p>
        )}
      </div>

      {/* Barra fixa no celular */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Estimativa</p>
            <p className="text-lg font-semibold tabular-nums">{quote.ok ? formatBRL(quote.totalCents) : "—"}</p>
          </div>
          <Button onClick={add} disabled={!quote.ok || adding}>
            {adding && <Loader2 className="h-4 w-4 animate-spin" />}
            Adicionar ao carrinho
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Check, Loader2, Lock, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getShippingQuotes, placeOrderAction } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import type { CartView } from "@/lib/cart/types";
import type { ShippingQuote } from "@/lib/shipping";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";
import { UFS } from "@/lib/validation/common";
import { useCart } from "./cart-provider";
import { CouponForm } from "./coupon-form";
import { CustomThumb } from "./custom-thumb";

function maskPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
const maskCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");

type Method = "PICKUP" | "LOCAL_DELIVERY" | "NATIONAL";

export function CheckoutForm({ initialCart }: { initialCart: CartView }) {
  const router = useRouter();
  const { cart: liveCart, ready, reset } = useCart();
  const cart = ready ? liveCart : initialCart;

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    notes: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [method, setMethod] = useState<Method | null>(null);
  const [quotes, setQuotes] = useState<ShippingQuote[]>([]);
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [cepMessage, setCepMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const numberRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Recalcula o frete quando o subtotal (ou a cidade) muda
  const subtotalKey = cart.subtotalCents - cart.discountCents;
  const quoteKey = `${subtotalKey}|${form.city}|${form.state}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loadingQuotes = loadedKey !== quoteKey;
  useEffect(() => {
    let cancelled = false;
    getShippingQuotes({ cep: form.cep.replace(/\D/g, "") || undefined, city: form.city || undefined, state: form.state || undefined })
      .then((result) => {
        if (cancelled) return;
        setQuotes(result.quotes);
        setMethod((current) => {
          const valid = result.quotes.filter((q) => q.available);
          if (current && valid.some((q) => q.method === current)) return current;
          return (valid.find((q) => q.method !== "PICKUP") ?? valid[0])?.method ?? null;
        });
      })
      .catch(() => !cancelled && toast.error("Não foi possível calcular o frete agora."))
      .finally(() => !cancelled && setLoadedKey(quoteKey));
    return () => {
      cancelled = true;
    };
    // O CEP completo só muda cidade/estado depois da consulta; quoteKey cobre o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepStatus("loading");
    setCepMessage(null);
    try {
      const res = await fetch(`/api/cep/${digits}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "CEP não encontrado");
      setForm((f) => ({ ...f, street: data.street || f.street, district: data.district || f.district, city: data.city, state: data.state }));
      setCepStatus("found");
      setTimeout(() => numberRef.current?.focus(), 50);
    } catch (error) {
      setCepStatus("error");
      setCepMessage(error instanceof Error ? error.message : "CEP não encontrado");
    }
  }

  const selected = quotes.find((q) => q.method === method && q.available) ?? null;
  const needsAddress = selected ? selected.requiresAddress : method !== "PICKUP";
  const total = cart.subtotalCents - cart.discountCents + (selected?.priceCents ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!method) {
      toast.error("Escolha a forma de entrega");
      return;
    }
    setSubmitting(true);
    setErrors({});
    const payload = {
      shippingMethod: method,
      name: form.name,
      phone: form.phone,
      email: form.email,
      notes: form.notes,
      acceptTerms,
      ...(method === "PICKUP"
        ? {}
        : {
            address: {
              cep: form.cep,
              street: form.street,
              number: form.number,
              complement: form.complement,
              district: form.district,
              city: form.city,
              state: form.state,
            },
          }),
    };
    const result = await placeOrderAction(payload);
    if (!result.ok) {
      setSubmitting(false);
      if (result.fields) {
        const mapped: Record<string, string> = {};
        for (const [key, message] of Object.entries(result.fields)) mapped[key.replace(/^address\./, "")] = message;
        setErrors(mapped);
        const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
        first?.focus();
      }
      toast.error(result.error);
      return;
    }
    reset();
    router.push(`/pedido/${result.code}/pagamento`);
  }

  if (cart.items.length === 0 && !submitting) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-medium">Seu carrinho está vazio.</p>
        <Link href="/produtos" className="mt-3 inline-block text-accent hover:underline">
          Ver chaveiros →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-10 lg:grid-cols-[1fr_400px]">
      <div className="space-y-10">
        <section aria-labelledby="sec-contato">
          <h2 id="sec-contato" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="font-mono text-sm text-accent">01</span> Seus dados
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" htmlFor="name" error={errors.name} className="sm:col-span-2">
              <Input id="name" autoComplete="name" value={form.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} required />
            </Field>
            <Field label="Telefone / WhatsApp" htmlFor="phone" error={errors.phone} hint="Para avisar sobre o pedido">
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(11) 98765-4321"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: maskPhone(e.target.value) }))}
                aria-invalid={Boolean(errors.phone)}
                required
              />
            </Field>
            <Field label="E-mail" htmlFor="email" error={errors.email}>
              <Input id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={set("email")} aria-invalid={Boolean(errors.email)} required />
            </Field>
          </div>
        </section>

        <section aria-labelledby="sec-entrega">
          <h2 id="sec-entrega" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="font-mono text-sm text-accent">02</span> Entrega
          </h2>

          <div className="mt-5 grid gap-4 sm:grid-cols-[180px_1fr]">
            <Field
              label="CEP"
              htmlFor="cep"
              error={errors.cep ?? (cepStatus === "error" ? (cepMessage ?? undefined) : undefined)}
              hint={cepStatus === "found" ? `${form.city}/${form.state}` : needsAddress ? undefined : "Opcional na retirada"}
            >
              <div className="relative">
                <Input
                  id="cep"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  value={form.cep}
                  onChange={(e) => {
                    const value = maskCep(e.target.value);
                    setForm((f) => ({ ...f, cep: value }));
                    if (value.replace(/\D/g, "").length === 8) void lookupCep(value);
                  }}
                  aria-invalid={Boolean(errors.cep)}
                  className="font-mono"
                />
                {cepStatus === "loading" && <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
                {cepStatus === "found" && <Check className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-success" />}
              </div>
            </Field>
            <a href="https://buscacepinter.correios.com.br/app/endereco/index.php" target="_blank" rel="noopener noreferrer" className="self-center text-sm text-muted underline-offset-4 hover:underline sm:mt-6">
              Não sei meu CEP
            </a>
          </div>

          <div className="mt-5 grid gap-2" role="radiogroup" aria-label="Forma de entrega">
            {loadingQuotes && quotes.length === 0 ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculando opções de entrega…
              </div>
            ) : quotes.length === 0 ? (
              <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">Nenhuma forma de entrega está ativa no momento. Fale com a gente pelo WhatsApp.</p>
            ) : (
              quotes.map((quote) => (
                <button
                  key={quote.method}
                  type="button"
                  role="radio"
                  aria-checked={method === quote.method}
                  disabled={!quote.available}
                  onClick={() => setMethod(quote.method as Method)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-surface p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                    method === quote.method ? "border-ink ring-1 ring-ink" : "border-line hover:border-ink/30",
                  )}
                >
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", method === quote.method ? "border-accent" : "border-line-strong")}>
                    {method === quote.method && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{quote.label}</span>
                    <span className="block text-sm text-muted">{quote.available ? quote.description : quote.unavailableReason}</span>
                    {quote.available && quote.estimatedDays != null && quote.estimatedDays > 0 && (
                      <span className="spec mt-1 block text-muted">+ {quote.estimatedDays} dias úteis após a produção</span>
                    )}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{quote.priceCents === 0 ? "Grátis" : formatBRL(quote.priceCents)}</span>
                </button>
              ))
            )}
          </div>

          {needsAddress && (
            <div className="mt-5 grid gap-4 sm:grid-cols-6">
              <Field label="Rua" htmlFor="street" error={errors.street} className="sm:col-span-4">
                <Input id="street" autoComplete="address-line1" value={form.street} onChange={set("street")} aria-invalid={Boolean(errors.street)} />
              </Field>
              <Field label="Número" htmlFor="number" error={errors.number} className="sm:col-span-2">
                <Input id="number" ref={numberRef} inputMode="text" value={form.number} onChange={set("number")} aria-invalid={Boolean(errors.number)} />
              </Field>
              <Field label="Complemento" htmlFor="complement" optional className="sm:col-span-3">
                <Input id="complement" autoComplete="address-line2" value={form.complement} onChange={set("complement")} />
              </Field>
              <Field label="Bairro" htmlFor="district" error={errors.district} className="sm:col-span-3">
                <Input id="district" value={form.district} onChange={set("district")} aria-invalid={Boolean(errors.district)} />
              </Field>
              <Field label="Cidade" htmlFor="city" error={errors.city} className="sm:col-span-4">
                <Input id="city" autoComplete="address-level2" value={form.city} onChange={set("city")} aria-invalid={Boolean(errors.city)} />
              </Field>
              <Field label="Estado" htmlFor="state" error={errors.state} className="sm:col-span-2">
                <Select id="state" autoComplete="address-level1" value={form.state} onChange={set("state")} aria-invalid={Boolean(errors.state)}>
                  <option value="">UF</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <Field label="Observações do pedido" htmlFor="notes" optional className="mt-5">
            <Textarea id="notes" value={form.notes} onChange={set("notes")} maxLength={600} placeholder="Algo que a gente precisa saber?" />
          </Field>
        </section>

        <section aria-labelledby="sec-pagamento">
          <h2 id="sec-pagamento" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <span className="font-mono text-sm text-accent">03</span> Pagamento
          </h2>
          <div className="mt-5 flex gap-3 rounded-xl border border-line bg-surface p-4">
            <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div className="text-sm">
              <p className="font-medium">Pix</p>
              <p className="mt-0.5 text-muted">
                Ao criar o pedido, mostramos o QR Code e o Pix Copia e Cola com o valor exato. A confirmação é feita pela nossa equipe assim que o Pix cair.
              </p>
            </div>
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-5 rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-24">
        <h2 className="text-lg font-semibold tracking-tight">Resumo do pedido</h2>
        <ul className="max-h-72 space-y-3 overflow-y-auto">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-sunken">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <CustomThumb color={item.colorHex ?? "#5b3df5"} />}
                <span className="absolute -top-0 -right-0 grid h-5 min-w-5 place-items-center rounded-bl-md bg-ink px-1 text-[0.65rem] font-semibold text-white">{item.quantity}</span>
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">{item.name}</span>
                <span className="block truncate text-xs text-muted">{[item.variantName, ...item.options.map((o) => `${o.label}: ${o.value}`)].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="text-sm font-medium tabular-nums">{formatBRL(item.totalCents)}</span>
            </li>
          ))}
        </ul>
        <CouponForm />
        {cart.coupon?.error && <p className="text-sm text-danger">{cart.coupon.error}</p>}
        <dl className="space-y-2 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatBRL(cart.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Frete</dt>
            <dd className="tabular-nums">{selected ? (selected.priceCents === 0 ? "Grátis" : formatBRL(selected.priceCents)) : "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Desconto</dt>
            <dd className={cn("tabular-nums", cart.discountCents > 0 && "text-success")}>{cart.discountCents > 0 ? `−${formatBRL(cart.discountCents)}` : formatBRL(0)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <dt className="font-medium">Total</dt>
            <dd className="text-2xl font-semibold tracking-tight tabular-nums">{formatBRL(total)}</dd>
          </div>
        </dl>
        <Checkbox
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          aria-invalid={Boolean(errors.acceptTerms)}
          label={
            <>
              Li e concordo com os{" "}
              <Link href="/termos" target="_blank" className="text-accent underline-offset-2 hover:underline">
                termos
              </Link>{" "}
              e a{" "}
              <Link href="/politica-de-privacidade" target="_blank" className="text-accent underline-offset-2 hover:underline">
                política de privacidade
              </Link>
              .
            </>
          }
        />
        {errors.acceptTerms && <p className="-mt-3 text-sm text-danger">{errors.acceptTerms}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={submitting || cart.hasIssues || !method}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          Criar pedido e gerar Pix
        </Button>
        {cart.hasIssues && (
          <p className="text-center text-xs text-danger">
            Há itens com problema no carrinho.{" "}
            <Link href="/carrinho" className="underline">
              Revisar
            </Link>
          </p>
        )}
        <p className="text-center text-xs text-muted">O valor final é conferido pelo servidor com os preços atuais.</p>
      </aside>
    </form>
  );
}

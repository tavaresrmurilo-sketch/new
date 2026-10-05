import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** Integração Stripe via API REST (sem SDK). Só funciona quando STRIPE_SECRET_KEY está configurada. */
export function stripeConfigured() {
  return Boolean(env().STRIPE_SECRET_KEY);
}

async function stripe<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe não configurado.");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `Stripe HTTP ${res.status}`);
  return json;
}

export async function createCheckoutSession(input: { priceId: string; organizationId: string; planId: string; customerEmail: string; customerId?: string | null; successUrl: string; cancelUrl: string }) {
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.organizationId,
    "metadata[organizationId]": input.organizationId,
    "metadata[planId]": input.planId,
    "subscription_data[metadata][organizationId]": input.organizationId,
    "subscription_data[metadata][planId]": input.planId,
    locale: "pt-BR",
  };
  if (input.customerId) params.customer = input.customerId;
  else params.customer_email = input.customerEmail;
  return stripe<{ id: string; url: string }>("checkout/sessions", params);
}

export async function createPortalSession(customerId: string, returnUrl: string) {
  return stripe<{ url: string }>("billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

/** Valida o header Stripe-Signature (t=…,v1=…) com tolerância de 5 minutos. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return signatures.some((s) => s.length === expected.length && timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

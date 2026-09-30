import "server-only";
import { cookies } from "next/headers";
import { sign, unsign } from "@/lib/security/signing";

/**
 * Quem criou o pedido (ou confirmou e-mail/telefone em /acompanhar) recebe um cookie
 * assinado com os códigos que pode ver. Sem ele, a página do pedido pede verificação.
 */
const COOKIE = "chx_orders";
const MAX_CODES = 12;

export async function getAccessibleOrderCodes(): Promise<string[]> {
  const store = await cookies();
  const raw = unsign(store.get(COOKIE)?.value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string").slice(0, MAX_CODES) : [];
  } catch {
    return [];
  }
}

export async function canAccessOrder(code: string): Promise<boolean> {
  return (await getAccessibleOrderCodes()).includes(code);
}

/** Só pode ser chamado em Server Actions / Route Handlers (altera cookies). */
export async function grantOrderAccess(code: string): Promise<void> {
  const current = await getAccessibleOrderCodes();
  const next = [code, ...current.filter((c) => c !== code)].slice(0, MAX_CODES);
  const store = await cookies();
  store.set(COOKIE, sign(JSON.stringify(next)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 120,
  });
}

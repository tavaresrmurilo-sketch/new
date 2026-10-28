/**
 * Telefones: normalização (somente dígitos com código do país), validação e
 * formatação. Focado em números brasileiros; números de outros países são
 * aceitos quando informados com "+" e código do país.
 */

const BR = "55";

function isValidBrazilianNational(national: string): boolean {
  // DDD (2 dígitos, sem zero) + 8 dígitos (fixo) ou 9 dígitos (celular iniciado por 9)
  if (!/^[1-9][1-9]\d{8,9}$/.test(national)) return false;
  if (national.length === 11) return national[2] === "9";
  return /^[2-5]$/.test(national[2]);
}

/**
 * Retorna o telefone apenas com dígitos e código do país
 * (ex.: "5511987654321") ou `null` se for inválido.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = input.trim();
  if (!raw) return null;

  let international = false;
  if (raw.startsWith("+")) {
    international = true;
    raw = raw.slice(1);
  }
  let digits = raw.replace(/\D/g, "");
  if (!international && digits.startsWith("00")) {
    international = true;
    digits = digits.slice(2);
  }

  if (international) {
    if (digits.startsWith(BR)) {
      return isValidBrazilianNational(digits.slice(2)) ? digits : null;
    }
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  // Prefixo de operadora/tronco nacional: 0XX...
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  if (digits.length === 10 || digits.length === 11) {
    return isValidBrazilianNational(digits) ? BR + digits : null;
  }
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith(BR)) {
    return isValidBrazilianNational(digits.slice(2)) ? digits : null;
  }
  return null;
}

export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input) !== null;
}

/** "+55 (11) 98765-4321" para números brasileiros; "+<dígitos>" para os demais. */
export function formatPhone(normalized: string): string {
  if (normalized.startsWith(BR) && (normalized.length === 12 || normalized.length === 13)) {
    const ddd = normalized.slice(2, 4);
    const number = normalized.slice(4);
    const head = number.length === 9 ? number.slice(0, 5) : number.slice(0, 4);
    const tail = number.slice(head.length);
    return `(${ddd}) ${head}-${tail}`;
  }
  return `+${normalized}`;
}

/**
 * Link de envio assistido do WhatsApp (wa.me). Abrir este link NÃO envia a
 * mensagem: o usuário revisa e envia manualmente no WhatsApp.
 */
export function whatsappUrl(normalized: string, text: string): string {
  const base = `https://wa.me/${normalized.replace(/\D/g, "")}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function telUrl(normalized: string): string {
  return `tel:+${normalized.replace(/\D/g, "")}`;
}

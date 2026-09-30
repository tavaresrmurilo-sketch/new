/**
 * Dinheiro na CHAVIX 3D é sempre inteiro em centavos.
 * Nunca some/multiplique valores em reais com ponto flutuante.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: number): string {
  // Intl usa espaço não separável entre "R$" e o número; trocamos por espaço fino comum.
  return brl.format(cents / 100).replace(/ /g, " ");
}

/** "19,90" | "19.90" | "R$ 1.234,56" | "20" → centavos. Retorna null se inválido. */
export function parseBRL(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || cleaned.startsWith("-")) return null;
  let normalized = cleaned;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastComma > lastDot) {
    // formato brasileiro: 1.234,56
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > -1 && lastComma > -1) {
    // formato 1,234.56
    normalized = cleaned.replace(/,/g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [reais, centavos = ""] = normalized.split(".");
  const value = Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** Centavos → "19,90" (para preencher inputs) */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const reais = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return `${reais},${String(rest).padStart(2, "0")}`;
}

/** Percentual inteiro de um valor em centavos, arredondando para baixo (a favor do cliente não há centavo fantasma). */
export function percentOf(cents: number, percent: number): number {
  return Math.floor((cents * percent) / 100);
}

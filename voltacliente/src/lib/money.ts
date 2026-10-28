const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatBRL(cents: number): string {
  return brl.format(cents / 100);
}

const brlInteger = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Formato curto para eixos: "R$ 150", "R$ 1,2 mil". */
export function formatBRLCompact(cents: number): string {
  return Math.abs(cents) < 100_000 ? brlInteger.format(cents / 100) : brlCompact.format(cents / 100);
}

/** "150,00" — valor para preencher campos de formulário. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Converte texto monetário em centavos. Aceita "1.234,56", "1234.56",
 * "R$ 150", "150,5". Retorna `null` para vazio e `undefined` para inválido.
 */
export function parseMoneyToCents(input: string | number | null | undefined): number | null | undefined {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) && input >= 0 ? Math.round(input * 100) : undefined;
  }
  let value = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!value) return null;
  if (!/^[\d.,]+$/.test(value)) return undefined;

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    value = value.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    if (value.split(",").length > 2) return undefined;
    value = value.replace(",", ".");
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.split(".").join("");
  }

  if ((value.match(/\./g) ?? []).length > 1) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return Math.round(number * 100);
}

/**
 * Verificação anti-alucinação: todo número presente no texto do LLM precisa existir nos fatos
 * calculados pelo sistema (com tolerância de arredondamento). Caso contrário a resposta do LLM é
 * descartada e o sistema usa a narrativa determinística.
 */
function collectNumbers(value: unknown, out: number[], depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    out.push(value);
    return;
  }
  if (typeof value === "string") {
    extractNumbers(value).forEach((n) => out.push(n));
    return;
  }
  if (Array.isArray(value)) value.forEach((v) => collectNumbers(v, out, depth + 1));
  else if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, out, depth + 1));
}

/** Extrai números em formato pt-BR (1.234,56 / 12,5% / R$ 3 mil / 1,2 milhão). */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /(-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?|-?\d+(?:\.\d+)?)(\s*(?:mil|milh(?:ão|ões|ao|oes)|bi(?:lhão|lhões)?|k|mi)\b)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let raw = m[1];
    if (/\d\.\d{3}/.test(raw) || raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
    let n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const unit = (m[2] ?? "").trim().toLowerCase();
    if (unit === "mil" || unit === "k") n *= 1_000;
    else if (unit.startsWith("milh") || unit === "mi") n *= 1_000_000;
    else if (unit.startsWith("bi")) n *= 1_000_000_000;
    out.push(n);
  }
  return out;
}

export interface VerificationResult {
  ok: boolean;
  unverified: number[];
}

export function verifyNumbers(text: string, facts: unknown): VerificationResult {
  const known: number[] = [];
  collectNumbers(facts, known);
  const knownAbs = known.map((k) => Math.abs(k));
  const candidates = extractNumbers(text).map((n) => Math.abs(n));
  const unverified: number[] = [];
  for (const n of candidates) {
    // números pequenos inteiros (dias, contagens de itens, anos, ordinais) são permitidos
    if (Number.isInteger(n) && (n <= 31 || (n >= 1990 && n <= 2100))) continue;
    const ok = knownAbs.some((k) => {
      if (k === n) return true;
      const tol = Math.max(0.051, Math.abs(k) * 0.006);
      if (Math.abs(k - n) <= tol) return true;
      // formas abreviadas: "R$ 1,2 milhão" ~ 1.234.567
      if (n >= 1000 && Math.abs(k - n) / Math.max(k, 1) <= 0.05 && String(Math.round(n)).replace(/0+$/, "").length <= 3) return true;
      return false;
    });
    if (!ok) unverified.push(n);
  }
  return { ok: unverified.length === 0, unverified };
}

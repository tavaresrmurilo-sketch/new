import type { Operator } from "@/lib/automation-catalog";

export interface Condition {
  field: string;
  operator: Operator;
  value: string;
}

/** Avalia condições IF (todas precisam ser verdadeiras). Função pura — coberta por testes. */
export function evaluateConditions(conditions: Condition[], fields: Record<string, unknown>): boolean {
  return conditions.every((c) => evaluate(c, fields[c.field]));
}

function evaluate(c: Condition, actual: unknown): boolean {
  if (actual === undefined) return false;
  const expected = c.value;
  const numA = typeof actual === "number" ? actual : Number(actual);
  const numE = Number(String(expected).replace(",", "."));
  const strA = actual === null ? "" : String(actual).toLowerCase();
  const strE = String(expected ?? "").toLowerCase();
  switch (c.operator) {
    case "equals":
      return strA === strE;
    case "not_equals":
      return strA !== strE;
    case "contains":
      return strA.includes(strE);
    case "gt":
      return Number.isFinite(numA) && Number.isFinite(numE) && numA > numE;
    case "gte":
      return Number.isFinite(numA) && Number.isFinite(numE) && numA >= numE;
    case "lt":
      return Number.isFinite(numA) && Number.isFinite(numE) && numA < numE;
    case "lte":
      return Number.isFinite(numA) && Number.isFinite(numE) && numA <= numE;
    default:
      return false;
  }
}

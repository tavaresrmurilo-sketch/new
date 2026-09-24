import { fmt } from "./format";

export type ValueFmt = "money" | "pct" | "int" | "number" | "pp" | "date" | "text";

export function formatValue(v: number | string | null | undefined, f: ValueFmt = "number", compact = false): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return f === "date" ? fmt.date(v) : v;
  switch (f) {
    case "money":
      return compact ? fmt.moneyCompact(v) : fmt.money(v);
    case "pct":
      return fmt.pct(v);
    case "pp":
      return fmt.pp(v);
    case "int":
      return fmt.int(v);
    default:
      return fmt.number(v);
  }
}

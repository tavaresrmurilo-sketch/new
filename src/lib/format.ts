const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** Formato compacto determinístico (idêntico no servidor e no navegador, evitando divergência de ICU). */
function compactMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const one = (n: number) => n.toFixed(1).replace(/\.0$/, "").replace(".", ",");
  if (abs >= 1e9) return `${sign}R$ ${one(abs / 1e9)} bi`;
  if (abs >= 1e6) return `${sign}R$ ${one(abs / 1e6)} mi`;
  if (abs >= 1e3) return `${sign}R$ ${one(abs / 1e3)} mil`;
  return `${sign}R$ ${Math.round(abs)}`;
}
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export const fmt = {
  money: (v: number | null | undefined) => (v === null || v === undefined ? "—" : brl.format(v)),
  moneyCompact: (v: number | null | undefined) => (v === null || v === undefined ? "—" : compactMoney(v)),
  number: (v: number | null | undefined) => (v === null || v === undefined ? "—" : num.format(v)),
  int: (v: number | null | undefined) => (v === null || v === undefined ? "—" : int.format(v)),
  pct: (v: number | null | undefined, digits = 1) =>
    v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`,
  pp: (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`,
  signedPct: (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
  date: (d: Date | string | null | undefined) => {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  },
  dateTime: (d: Date | string | null | undefined) => {
    if (!d) return "—";
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  },
  weekday: (d: Date | string) => {
    const date = typeof d === "string" ? new Date(d) : d;
    const s = date.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "UTC" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },
  month: (key: string) => {
    const [y, m] = key.split("-").map(Number);
    const s = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
    return s.replace(".", "");
  },
};

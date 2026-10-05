import { dateOnlyKey, dayKeyInTz, diffKeys } from "./dates";
import { toNumber } from "./utils";

const currencyCache = new Map<string, Intl.NumberFormat>();

export function formatCurrency(value: unknown, currency = "BRL", opts: { compact?: boolean; decimals?: boolean } = {}): string {
  const key = `${currency}-${opts.compact ? "c" : ""}-${opts.decimals === false ? "0" : "2"}`;
  let f = currencyCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : opts.decimals === false ? 0 : 2,
      minimumFractionDigits: opts.compact || opts.decimals === false ? 0 : 2,
    });
    currencyCache.set(key, f);
  }
  return f.format(toNumber(value));
}

export function formatNumber(value: unknown, decimals = 0): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(toNumber(value));
}

export function formatPercent(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${formatNumber(value, decimals)}%`;
}

/** Campo "somente data" (exibido em UTC). */
export function formatDate(date: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric", ...opts }).format(d);
}

export function formatShortDate(date: Date | string | null | undefined): string {
  return formatDate(date, { year: undefined, day: "2-digit", month: "short" });
}

/** Instante (data e hora) no fuso do workspace. */
export function formatDateTime(date: Date | string | null | undefined, tz: string, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  }).format(d);
}

export function formatTime(date: Date | string, tz: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
}

/** "há 3 dias", "em 2 dias", "hoje" — comparando dias de calendário no fuso. */
export function formatRelativeDay(date: Date | string | null | undefined, tz: string, now = new Date(), dateOnly = false): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const key = dateOnly ? dateOnlyKey(d) : dayKeyInTz(d, tz);
  const diff = diffKeys(dayKeyInTz(now, tz), key);
  if (diff === 0) return "hoje";
  if (diff === 1) return "amanhã";
  if (diff === -1) return "ontem";
  if (diff > 0) return `em ${diff} dias`;
  return `há ${-diff} dias`;
}

export function formatRelativeTime(date: Date | string | null | undefined, now = new Date()): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.round((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return "agora";
  const min = Math.round(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return `há ${days} ${days === 1 ? "dia" : "dias"}`;
  const months = Math.round(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.round(months / 12);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 1)} KB`;
  if (bytes < 1024 ** 3) return `${formatNumber(bytes / 1024 ** 2, 1)} MB`;
  return `${formatNumber(bytes / 1024 ** 3, 2)} GB`;
}

export function formatDocument(doc: string | null | undefined): string {
  if (!doc) return "—";
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  if (d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2).replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")}`;
  return phone;
}

/** Remove caracteres de controle e limita tamanho de textos livres. React já escapa a saída HTML. */
export function cleanText(value: string | null | undefined, max = 10_000): string | null {
  if (value === null || value === undefined) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned === "" ? null : cleaned.slice(0, max);
}

export function onlyDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits === "" ? null : digits;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const v = value?.trim().toLowerCase();
  return v ? v : null;
}

export function emailDomain(email: string | null | undefined): string | null {
  const v = normalizeEmail(email);
  if (!v || !v.includes("@")) return null;
  const domain = v.split("@")[1]!;
  const generic = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "icloud.com", "live.com", "uol.com.br", "bol.com.br", "terra.com.br"];
  return generic.includes(domain) ? null : domain;
}

export function domainFromWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Escapa células de CSV contra injeção de fórmulas (=, +, -, @). */
export function csvSafe(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

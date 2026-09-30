/** Remove acentos e diacríticos. */
export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Texto para busca: minúsculo, sem acentos, espaços simples. */
export function normalizeSearch(value: string): string {
  return stripAccents(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function slugify(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** "joao.silva@gmail.com" → "jo•••@gmail.com" */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "•••";
  return `${user.slice(0, 2)}•••@${domain}`;
}

/** "11987654321" → "(11) •••••-4321" */
export function maskPhone(phone: string): string {
  const d = onlyDigits(phone).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length < 4) return "•••";
  const ddd = d.length >= 10 ? `(${d.slice(0, 2)}) ` : "";
  return `${ddd}•••••-${d.slice(-4)}`;
}

/** Formata telefone brasileiro: (11) 98765-4321 */
export function formatPhone(phone: string): string {
  const d = onlyDigits(phone).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function formatCep(cep: string): string {
  const d = onlyDigits(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : cep;
}

/** Primeiro nome + inicial do sobrenome: "Maria Souza Lima" → "Maria L." */
export function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Cliente";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

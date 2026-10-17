export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function shortId(length = 5): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Slug único para eventos: "show-de-rock-na-praca-x7k2m". */
export function eventSlug(title: string): string {
  const base = slugify(title, 60) || "evento";
  return `${base}-${shortId(5)}`;
}

export function normalizeSearch(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

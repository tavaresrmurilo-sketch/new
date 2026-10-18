import { z } from "zod";
import { BR_STATES } from "@/lib/constants";
import { formatCep, isHttpUrl, normalizeUrlInput } from "./event";

/** Validação de organização e locais salvos (cliente e servidor). */

const ufSchema = z
  .string({ error: "Escolha a UF" })
  .trim()
  .toUpperCase()
  .refine((v) => (BR_STATES as readonly string[]).includes(v), "Escolha a UF");

const optional = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .optional()
    .transform((v) => (v ? v : null));

export const ORG_NAME_MAX = 80;
export const ORG_BIO_SHORT_MAX = 280;
export const ORG_BIO_MAX = 600;

const orgName = z.string({ error: "Informe o nome" }).trim().min(2, "Informe o nome da organização").max(ORG_NAME_MAX, `Use até ${ORG_NAME_MAX} caracteres`);
const city = z.string({ error: "Informe a cidade" }).trim().min(2, "Informe a cidade").max(80, "Cidade muito longa");

export const orgCreateSchema = z.object({
  name: orgName,
  city,
  state: ufSchema,
  bio: optional(ORG_BIO_SHORT_MAX, `Use até ${ORG_BIO_SHORT_MAX} caracteres`),
});
export type OrgCreateData = z.output<typeof orgCreateSchema>;

/** "@casa.do.som", "instagram.com/casa.do.som/" ou "https://www.instagram.com/casa.do.som" → "casa.do.som". */
export function normalizeInstagram(input: string): string | null {
  let v = input.trim();
  if (!v) return null;
  const m = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i.exec(v);
  if (m) v = m[1];
  v = v.replace(/^@+/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v.toLowerCase() : null;
}

/** Só dígitos, com DDI. Números brasileiros sem DDI (10–11 dígitos) ganham o 55. */
export function normalizeWhatsapp(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (!d) return null;
  if ((d.length === 10 || d.length === 11) && !d.startsWith("55")) d = `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

export const orgUpdateSchema = z.object({
  name: orgName,
  bio: optional(ORG_BIO_MAX, `Use até ${ORG_BIO_MAX} caracteres`),
  city,
  state: ufSchema,
  website: z
    .string()
    .trim()
    .max(300, "Link muito longo")
    .optional()
    .transform((v) => (v ? normalizeUrlInput(v) : null))
    .refine((v) => v == null || isHttpUrl(v), "Use um endereço como https://seusite.com.br"),
  instagram: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? normalizeInstagram(v) ?? "__invalid__" : null))
    .refine((v) => v !== "__invalid__", "Use @perfil ou o link do Instagram"),
  whatsapp: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? normalizeWhatsapp(v) ?? "__invalid__" : null))
    .refine((v) => v !== "__invalid__", "Informe DDI + DDD + número, como 55 11 91234-5678"),
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v == null || z.email().safeParse(v).success, "E-mail inválido"),
  logoUrl: optional(500, "Imagem inválida"),
  coverUrl: optional(500, "Imagem inválida"),
});
export type OrgUpdateData = z.output<typeof orgUpdateSchema>;

export const venueSchema = z
  .object({
    name: z.string({ error: "Informe o nome do local" }).trim().min(2, "Informe o nome do local").max(120, "Nome muito longo"),
    address: z.string({ error: "Informe o endereço" }).trim().min(3, "Informe o endereço").max(200, "Endereço muito longo"),
    neighborhood: optional(80, "Bairro muito longo"),
    city,
    state: z
      .string()
      .trim()
      .toUpperCase()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v == null || (BR_STATES as readonly string[]).includes(v), "UF inválida"),
    postalCode: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.replace(/\D/g, "") : null))
      .refine((v) => v == null || v.length === 8, "O CEP tem 8 dígitos")
      .transform((v) => (v ? formatCep(v) : null)),
    lat: z.number({ error: "Marque o local no mapa" }).min(-90).max(90),
    lng: z.number({ error: "Marque o local no mapa" }).min(-180).max(180),
  });
export type VenueData = z.output<typeof venueSchema>;
export type VenueInput = z.input<typeof venueSchema>;

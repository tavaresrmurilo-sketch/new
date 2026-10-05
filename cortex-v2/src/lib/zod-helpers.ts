import { z } from "zod";

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

/** Texto opcional: "" → null, com trim e limite. */
export const optText = (max = 500) =>
  z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null), z.string().max(max).nullable());

export const reqText = (max = 200, message = "Campo obrigatório") => z.string().trim().min(1, message).max(max);

/** ID opcional vindo de select: "" → null. */
export const optId = () => z.preprocess(blankToNull, z.string().min(1).max(64).nullable());

/** Número opcional: "" → null; aceita "1.234,56" e "1234.56". */
export const optNumber = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "string") {
        const s = v.trim();
        const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : v;
      }
      return v;
    },
    z
      .number({ invalid_type_error: "Informe um número válido" })
      .min(opts.min ?? -1e12)
      .max(opts.max ?? 1e12)
      .nullable(),
  );

export const reqNumber = (opts: { min?: number; max?: number } = {}) =>
  z.preprocess(
    (v) => {
      if (typeof v === "string") {
        const s = v.trim();
        if (s === "") return undefined;
        const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
        return Number.isFinite(n) ? n : v;
      }
      return v;
    },
    z.number({ required_error: "Campo obrigatório", invalid_type_error: "Informe um número válido" }).min(opts.min ?? -1e12).max(opts.max ?? 1e12),
  );

/** Data "somente dia" no formato AAAA-MM-DD. */
export const optDate = () =>
  z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable());

export const reqDate = (message = "Informe a data") => z.string({ required_error: message }).regex(/^\d{4}-\d{2}-\d{2}$/, message);

/** Data e hora local (input datetime-local). */
export const reqDateTime = (message = "Informe data e hora") => z.string({ required_error: message }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, message);
export const optDateTime = () => z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Data/hora inválida").nullable());

export const optEmail = () =>
  z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim().toLowerCase()) : v ?? null), z.string().email("E-mail inválido").max(200).nullable());

export const tagList = () => z.array(z.string().trim().min(1).max(40)).max(20).default([]);

export const idParam = z.object({ id: z.string().min(1).max(64) });

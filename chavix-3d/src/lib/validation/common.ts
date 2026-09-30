import { z } from "zod";
import { onlyDigits } from "@/lib/text";

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** Remove caracteres de controle e colapsa espaços. */
export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+/g, " ").trim();
}

export const text = (min: number, max: number, message?: string) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(min, message ?? `Mínimo de ${min} caracteres`).max(max, `Máximo de ${max} caracteres`));

export const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? cleanText(v) : ""))
    .pipe(z.string().max(max, `Máximo de ${max} caracteres`));

/** Telefone brasileiro com DDD (10 ou 11 dígitos), aceita +55. Guarda só dígitos, sem o 55. */
export const phoneBR = z
  .string()
  .transform((v) => onlyDigits(v).replace(/^55(?=\d{10,11}$)/, ""))
  .pipe(z.string().regex(/^[1-9]{2}9?\d{8}$/, "Informe um telefone com DDD"));

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido").max(160));

export const cepField = z
  .string()
  .transform(onlyDigits)
  .pipe(z.string().length(8, "CEP deve ter 8 dígitos"));

export const ufField = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(UFS, { message: "Selecione o estado" }));

/** Primeira mensagem de erro de um ZodError, para exibir ao usuário. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos";
}

/** Mapa campo → mensagem, para formulários. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

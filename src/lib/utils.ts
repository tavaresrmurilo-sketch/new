import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

/** Normaliza texto para comparação: minúsculas, sem acentos, espaços simples. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%$., -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 2);
}

export function safeDiv(a: number, b: number): number | null {
  if (!b) return null;
  return a / b;
}

export function sum(values: number[]): number {
  return round(values.reduce((acc, v) => acc + v, 0), 2);
}

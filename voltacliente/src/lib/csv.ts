import Papa from "papaparse";
import { z } from "zod";
import { parseFlexibleDate, type ISODate } from "./dates";
import { normalizePhone } from "./phone";

export const CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;

export type ContactPreferenceValue = "WHATSAPP" | "PHONE" | "EMAIL" | "ANY";

export type ImportedCustomer = {
  line: number;
  name: string;
  phone: string;
  phoneNormalized: string;
  email: string | null;
  notes: string | null;
  registeredAt: ISODate | null;
  contactPreference: ContactPreferenceValue;
  marketingConsent: boolean;
};

export type ImportIssue = { line: number; message: string };

export type ParsedImport = {
  rows: ImportedCustomer[];
  errors: ImportIssue[];
  duplicatesInFile: ImportIssue[];
  totalLines: number;
  missingColumns: string[];
};

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const HEADER_ALIASES: Record<string, string> = {
  nome: "nome",
  nome_completo: "nome",
  cliente: "nome",
  name: "nome",
  telefone: "telefone",
  whatsapp: "telefone",
  celular: "telefone",
  fone: "telefone",
  phone: "telefone",
  email: "email",
  e_mail: "email",
  observacoes: "observacoes",
  observacao: "observacoes",
  obs: "observacoes",
  notas: "observacoes",
  data_cadastro: "data_cadastro",
  data_de_cadastro: "data_cadastro",
  cadastro: "data_cadastro",
  cliente_desde: "data_cadastro",
  preferencia_contato: "preferencia_contato",
  preferencia_de_contato: "preferencia_contato",
  preferencia: "preferencia_contato",
  consentimento: "consentimento",
  aceita_mensagens: "consentimento",
  consentimento_mensagens: "consentimento",
};

const PREFERENCE_MAP: Record<string, ContactPreferenceValue> = {
  whatsapp: "WHATSAPP",
  zap: "WHATSAPP",
  telefone: "PHONE",
  ligacao: "PHONE",
  ligar: "PHONE",
  email: "EMAIL",
  e_mail: "EMAIL",
  qualquer: "ANY",
  todos: "ANY",
  indiferente: "ANY",
};

const YES = new Set(["sim", "s", "yes", "y", "true", "1", "x", "autorizado", "aceito"]);
const NO = new Set(["nao", "n", "no", "false", "0", ""]);

const emailSchema = z.email();

export function parseCustomersCsv(text: string): ParsedImport {
  const content = text.replace(/^﻿/, "");
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => HEADER_ALIASES[normalizeHeader(h)] ?? normalizeHeader(h),
    // Detecta automaticamente vírgula ou ponto e vírgula (padrão do Excel em pt-BR).
    delimitersToGuess: [";", ",", "\t", "|"],
  });

  const fields = parsed.meta.fields ?? [];
  const missingColumns = ["nome", "telefone"].filter((c) => !fields.includes(c));
  const result: ParsedImport = {
    rows: [],
    errors: [],
    duplicatesInFile: [],
    totalLines: parsed.data.length,
    missingColumns,
  };
  if (missingColumns.length > 0) return result;

  const seenPhones = new Map<string, number>();

  parsed.data.forEach((raw, index) => {
    const line = index + 2; // cabeçalho é a linha 1
    const name = (raw.nome ?? "").trim().replace(/\s+/g, " ");
    const phoneRaw = (raw.telefone ?? "").trim();
    const emailRaw = (raw.email ?? "").trim().toLowerCase();
    const notes = (raw.observacoes ?? "").trim();
    const dateRaw = (raw.data_cadastro ?? "").trim();
    const prefRaw = normalizeHeader(raw.preferencia_contato ?? "");
    const consentRaw = normalizeHeader(raw.consentimento ?? "");

    const problems: string[] = [];
    if (name.length < 2) problems.push("nome ausente ou muito curto");
    if (name.length > 120) problems.push("nome com mais de 120 caracteres");
    const phoneNormalized = normalizePhone(phoneRaw);
    if (!phoneNormalized) problems.push(phoneRaw ? `telefone inválido (${phoneRaw})` : "telefone ausente");
    if (emailRaw && !emailSchema.safeParse(emailRaw).success) problems.push(`e-mail inválido (${emailRaw})`);
    let registeredAt: ISODate | null = null;
    if (dateRaw) {
      registeredAt = parseFlexibleDate(dateRaw);
      if (!registeredAt) problems.push(`data de cadastro inválida (${dateRaw}); use DD/MM/AAAA`);
    }
    let contactPreference: ContactPreferenceValue = "WHATSAPP";
    if (prefRaw) {
      const pref = PREFERENCE_MAP[prefRaw];
      if (!pref) problems.push(`preferência de contato desconhecida (${raw.preferencia_contato})`);
      else contactPreference = pref;
    }
    let marketingConsent = false;
    if (YES.has(consentRaw)) marketingConsent = true;
    else if (!NO.has(consentRaw)) problems.push(`consentimento deve ser "sim" ou "não" (${raw.consentimento})`);
    if (notes.length > 2000) problems.push("observações com mais de 2000 caracteres");

    if (problems.length > 0) {
      result.errors.push({ line, message: problems.join("; ") });
      return;
    }

    const firstLine = seenPhones.get(phoneNormalized!);
    if (firstLine) {
      result.duplicatesInFile.push({ line, message: `mesmo telefone da linha ${firstLine}` });
      return;
    }
    seenPhones.set(phoneNormalized!, line);

    result.rows.push({
      line,
      name,
      phone: phoneRaw,
      phoneNormalized: phoneNormalized!,
      email: emailRaw || null,
      notes: notes || null,
      registeredAt,
      contactPreference,
      marketingConsent,
    });
  });

  return result;
}

/**
 * Escapa um valor para CSV, neutralizando fórmulas (CSV injection) que
 * planilhas executariam ao abrir o arquivo.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r,]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Gera CSV com ";" (compatível com Excel em português) e BOM UTF-8. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export const CSV_TEMPLATE =
  "nome;telefone;email;observacoes;data_cadastro;preferencia_contato;consentimento\r\n" +
  "Maria Souza;(11) 98765-4321;maria@exemplo.com;Prefere atendimento pela manhã;15/03/2025;whatsapp;sim\r\n";

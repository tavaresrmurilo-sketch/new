import { z } from "zod";

export const IMPORT_FIELDS = {
  clients: [
    { key: "name", label: "Nome", required: true, aliases: ["nome", "cliente", "empresa", "razao social", "name", "company"] },
    { key: "legalName", label: "Razão social", aliases: ["razao social", "razão social", "legal name"] },
    { key: "document", label: "CNPJ/CPF", aliases: ["cnpj", "cpf", "documento", "cnpj/cpf", "document"] },
    { key: "email", label: "E-mail", aliases: ["email", "e-mail", "mail"] },
    { key: "phone", label: "Telefone", aliases: ["telefone", "fone", "celular", "phone", "tel"] },
    { key: "website", label: "Site", aliases: ["site", "website", "url"] },
    { key: "industry", label: "Segmento", aliases: ["segmento", "setor", "industria", "indústria", "industry"] },
    { key: "city", label: "Cidade", aliases: ["cidade", "municipio", "município", "city"] },
    { key: "state", label: "UF", aliases: ["uf", "estado", "state"] },
    { key: "notes", label: "Observações", aliases: ["observacoes", "observações", "notas", "obs", "notes"] },
  ],
  leads: [
    { key: "name", label: "Nome", required: true, aliases: ["nome", "contato", "lead", "name"] },
    { key: "companyName", label: "Empresa", aliases: ["empresa", "companhia", "company", "organização"] },
    { key: "email", label: "E-mail", aliases: ["email", "e-mail", "mail"] },
    { key: "phone", label: "Telefone", aliases: ["telefone", "fone", "celular", "phone"] },
    { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "whats", "zap"] },
    { key: "jobTitle", label: "Cargo", aliases: ["cargo", "funcao", "função", "title", "job title"] },
    { key: "source", label: "Origem", aliases: ["origem", "fonte", "canal", "source"] },
    { key: "potentialValue", label: "Valor potencial", aliases: ["valor", "valor potencial", "potencial", "value"] },
    { key: "notes", label: "Observações", aliases: ["observacoes", "observações", "notas", "notes"] },
  ],
} as const;

export type ImportEntity = keyof typeof IMPORT_FIELDS;

export const importRowsSchema = z.object({
  entity: z.enum(["clients", "leads"]),
  fileName: z.string().max(200),
  rows: z.array(z.record(z.string(), z.string().max(5000))).min(1).max(2000),
  skipDuplicates: z.boolean().default(true),
});

import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { clientSchema } from "@/features/clients/schemas";
import { leadSchema } from "@/features/leads/schemas";
import type { ImportEntity } from "@/features/import/schemas";
import { logActivity } from "@/server/activity";
import { audit } from "@/server/audit";
import type { Ctx } from "@/server/auth/context";
import { normalizeName } from "@/server/modules/duplicates";
import { domainFromWebsite, emailDomain, onlyDigits } from "@/server/security/sanitize";

const SOURCE_MAP: Record<string, string> = {
  indicacao: "REFERRAL", indicação: "REFERRAL", referral: "REFERRAL", site: "WEBSITE", website: "WEBSITE", inbound: "INBOUND",
  outbound: "OUTBOUND", prospeccao: "OUTBOUND", prospecção: "OUTBOUND", evento: "EVENT", event: "EVENT", redes: "SOCIAL",
  social: "SOCIAL", instagram: "SOCIAL", linkedin: "SOCIAL", parceiro: "PARTNER", partner: "PARTNER", anuncio: "ADS", anúncio: "ADS", ads: "ADS", google: "ADS",
};

export interface PreviewRow {
  index: number;
  valid: boolean;
  errors: string[];
  duplicate: { name: string; reasons: string[] } | null;
  data: Record<string, unknown> | null;
}

function parseRow(entity: ImportEntity, raw: Record<string, string>) {
  if (entity === "clients") {
    return clientSchema.safeParse({ ...raw, kind: onlyDigits(raw.document)?.length === 11 ? "INDIVIDUAL" : "COMPANY", status: "ACTIVE", source: "OTHER", tags: [] });
  }
  const source = SOURCE_MAP[(raw.source ?? "").trim().toLowerCase()] ?? "OTHER";
  return leadSchema.safeParse({ ...raw, source, status: "NEW", tags: [] });
}

async function duplicateIndex(ctx: Ctx, entity: ImportEntity) {
  const keys = new Map<string, string>();
  if (entity === "clients") {
    const rows = await ctx.db.client.findMany({ select: { name: true, email: true, document: true, phone: true }, take: 50_000 });
    for (const r of rows) indexRow(keys, r.name, { name: r.name, email: r.email, document: r.document, phone: r.phone });
  } else {
    const rows = await ctx.db.lead.findMany({ where: { status: { not: "CONVERTED" } }, select: { name: true, companyName: true, email: true, phone: true }, take: 50_000 });
    for (const r of rows) indexRow(keys, r.name, { name: `${r.name}|${r.companyName ?? ""}`, email: r.email, document: null, phone: r.phone });
  }
  return keys;
}

function rowKeys(r: { name: string; email?: string | null; document?: string | null; phone?: string | null }) {
  const out: [string, string][] = [];
  if (r.email) out.push([`e:${r.email.toLowerCase()}`, "mesmo e-mail"]);
  const doc = onlyDigits(r.document);
  if (doc) out.push([`d:${doc}`, "mesmo CNPJ/CPF"]);
  const phone = onlyDigits(r.phone);
  if (phone && phone.length >= 8) out.push([`p:${phone.slice(-8)}`, "mesmo telefone"]);
  const name = normalizeName(r.name);
  if (name.length >= 3) out.push([`n:${name}`, "mesmo nome"]);
  return out;
}

function indexRow(map: Map<string, string>, label: string, r: { name: string; email?: string | null; document?: string | null; phone?: string | null }) {
  for (const [k] of rowKeys(r)) if (!map.has(k)) map.set(k, label);
}

/** Pré-visualização: valida cada linha e aponta duplicatas (na base e dentro do próprio arquivo). Nada é gravado. */
export async function previewImport(ctx: Ctx, entity: ImportEntity, rows: Record<string, string>[]): Promise<PreviewRow[]> {
  const index = await duplicateIndex(ctx, entity);
  const inFile = new Map<string, string>();
  return rows.map((raw, i) => {
    const parsed = parseRow(entity, raw);
    if (!parsed.success) {
      return { index: i, valid: false, errors: parsed.error.issues.map((x) => `${x.path.join(".") || "linha"}: ${x.message}`), duplicate: null, data: null };
    }
    const d = parsed.data as { name: string; companyName?: string | null; email?: string | null; document?: string | null; phone?: string | null };
    const nameKey = entity === "leads" ? `${d.name}|${d.companyName ?? ""}` : d.name;
    const keys = rowKeys({ name: nameKey, email: d.email, document: d.document, phone: d.phone });
    const reasons: string[] = [];
    let dupName: string | null = null;
    for (const [k, reason] of keys) {
      const hit = index.get(k) ?? inFile.get(k);
      if (hit) {
        reasons.push(inFile.has(k) && !index.has(k) ? `${reason} (repetido no arquivo)` : reason);
        dupName ??= hit;
      }
    }
    for (const [k] of keys) if (!inFile.has(k)) inFile.set(k, `${d.name} (linha ${i + 2})`);
    return { index: i, valid: true, errors: [], duplicate: reasons.length ? { name: dupName!, reasons } : null, data: parsed.data as Record<string, unknown> };
  });
}

export async function commitImport(ctx: Ctx, input: { entity: ImportEntity; fileName: string; rows: Record<string, string>[]; skipDuplicates: boolean }) {
  const preview = await previewImport(ctx, input.entity, input.rows);
  const toImport = preview.filter((r) => r.valid && (!input.skipDuplicates || !r.duplicate));
  const errors = preview.filter((r) => !r.valid).map((r) => ({ row: r.index + 2, errors: r.errors }));
  const now = new Date();
  for (let i = 0; i < toImport.length; i += 200) {
    const chunk = toImport.slice(i, i + 200);
    if (input.entity === "clients") {
      const data: Prisma.ClientCreateManyInput[] = chunk.map((r) => {
        const d = r.data as z.output<typeof clientSchema>;
        return {
          organizationId: ctx.org.id,
          name: d.name,
          kind: d.kind,
          legalName: d.legalName,
          document: onlyDigits(d.document),
          email: d.email,
          phone: d.phone,
          website: d.website,
          domain: domainFromWebsite(d.website) ?? emailDomain(d.email),
          industry: d.industry,
          city: d.city,
          state: d.state,
          notes: d.notes,
          status: "ACTIVE",
          ownerId: ctx.user.id,
          createdById: ctx.user.id,
          createdAt: now,
        };
      });
      await ctx.db.client.createMany({ data });
    } else {
      const data: Prisma.LeadCreateManyInput[] = chunk.map((r) => {
        const d = r.data as z.output<typeof leadSchema>;
        const { tags: _tags, ...rest } = d;
        return { ...rest, organizationId: ctx.org.id, ownerId: ctx.user.id, createdById: ctx.user.id, createdAt: now };
      });
      await ctx.db.lead.createMany({ data });
    }
  }
  const job = await ctx.db.importJob.create({
    data: {
      organizationId: ctx.org.id,
      entity: input.entity,
      fileName: input.fileName,
      status: "COMPLETED",
      totalRows: input.rows.length,
      importedRows: toImport.length,
      skippedRows: input.rows.length - toImport.length,
      errors: errors.slice(0, 500) as unknown as Prisma.InputJsonValue,
      createdById: ctx.user.id,
    },
  });
  await logActivity(ctx.db, { organizationId: ctx.org.id, userId: ctx.user.id }, {
    action: "import.completed",
    title: `${toImport.length} ${input.entity === "clients" ? "cliente(s)" : "lead(s)"} importado(s) de ${input.fileName}`,
    entityType: "import",
    entityId: job.id,
  });
  await audit(ctx, "data.imported", { entityType: "import", entityId: job.id, metadata: { entity: input.entity, imported: toImport.length, skipped: input.rows.length - toImport.length } });
  return { imported: toImport.length, skipped: input.rows.length - toImport.length, errors: errors.length, jobId: job.id };
}

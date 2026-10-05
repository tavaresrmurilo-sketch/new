import "server-only";
import type { Permission } from "@/lib/permissions";
import { can, type Ctx } from "@/server/auth/context";

export type SearchType = "client" | "contact" | "lead" | "opportunity" | "project" | "task" | "proposal" | "contract" | "document" | "meeting";

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
}

const PERM: Record<SearchType, Permission> = {
  client: "clients.read",
  contact: "clients.read",
  lead: "leads.read",
  opportunity: "opportunities.read",
  project: "projects.read",
  task: "tasks.read",
  proposal: "proposals.read",
  contract: "contracts.read",
  document: "documents.read",
  meeting: "meetings.read",
};

export const ALL_SEARCH_TYPES = Object.keys(PERM) as SearchType[];

/** Busca global por nome/título (com escopo do tenant e respeitando permissões). */
export async function searchRecords(ctx: Ctx, rawQuery: string, types: SearchType[] = ALL_SEARCH_TYPES, limit = 5): Promise<SearchResult[]> {
  const q = rawQuery.trim().slice(0, 80);
  // consulta vazia: devolve os registros mais recentes (usado pelos seletores de um único tipo)
  const recent = q.length < 2;
  if (recent && types.length !== 1) return [];
  const allowed = types.filter((t) => can(ctx, PERM[t]));
  const w = <T,>(cond: T): T | Record<string, never> => (recent ? {} : cond);
  const ci = { contains: q, mode: "insensitive" as const };
  const digits = q.replace(/\D/g, "");
  const db = ctx.db;
  const tasks: Promise<SearchResult[]>[] = [];

  if (allowed.includes("client"))
    tasks.push(
      db.client
        .findMany({
          where: w({ OR: [{ name: ci }, { legalName: ci }, { email: ci }, ...(digits.length >= 5 ? [{ document: { contains: digits } }] : [])] }),
          select: { id: true, name: true, city: true, industry: true },
          take: limit,
          orderBy: { updatedAt: "desc" },
        })
        .then((rows) => rows.map((r) => ({ type: "client", id: r.id, title: r.name, subtitle: [r.industry, r.city].filter(Boolean).join(" · "), href: `/app/clients/${r.id}` }))),
    );
  if (allowed.includes("contact"))
    tasks.push(
      db.contact
        .findMany({
          where: w({ OR: [{ name: ci }, { email: ci }] }),
          select: { id: true, name: true, jobTitle: true, clientId: true, client: { select: { name: true } } },
          take: limit,
        })
        .then((rows) =>
          rows.map((r) => ({
            type: "contact",
            id: r.id,
            title: r.name,
            subtitle: [r.jobTitle, r.client?.name].filter(Boolean).join(" · "),
            href: r.clientId ? `/app/clients/${r.clientId}?tab=contacts` : `/app/clients`,
          })),
        ),
    );
  if (allowed.includes("lead"))
    tasks.push(
      db.lead
        .findMany({ where: w({ OR: [{ name: ci }, { companyName: ci }, { email: ci }] }), select: { id: true, name: true, companyName: true }, take: limit, orderBy: { updatedAt: "desc" } })
        .then((rows) => rows.map((r) => ({ type: "lead", id: r.id, title: r.name, subtitle: r.companyName, href: `/app/leads/${r.id}` }))),
    );
  if (allowed.includes("opportunity"))
    tasks.push(
      db.opportunity
        .findMany({ where: w({ title: ci }), select: { id: true, title: true, client: { select: { name: true } } }, take: limit, orderBy: { updatedAt: "desc" } })
        .then((rows) => rows.map((r) => ({ type: "opportunity", id: r.id, title: r.title, subtitle: r.client.name, href: `/app/opportunities/${r.id}` }))),
    );
  if (allowed.includes("project"))
    tasks.push(
      db.project
        .findMany({ where: w({ OR: [{ name: ci }, { code: ci }] }), select: { id: true, name: true, client: { select: { name: true } } }, take: limit, orderBy: { updatedAt: "desc" } })
        .then((rows) => rows.map((r) => ({ type: "project", id: r.id, title: r.name, subtitle: r.client?.name, href: `/app/projects/${r.id}` }))),
    );
  if (allowed.includes("task"))
    tasks.push(
      db.task
        .findMany({ where: w({ title: ci }), select: { id: true, title: true, project: { select: { name: true } } }, take: limit, orderBy: { updatedAt: "desc" } })
        .then((rows) => rows.map((r) => ({ type: "task", id: r.id, title: r.title, subtitle: r.project?.name, href: `/app/tasks/${r.id}` }))),
    );
  if (allowed.includes("proposal")) {
    const num = Number(q.replace(/^#/, ""));
    tasks.push(
      db.proposal
        .findMany({
          where: w({ OR: [{ title: ci }, ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : [])] }),
          select: { id: true, title: true, number: true, client: { select: { name: true } } },
          take: limit,
          orderBy: { updatedAt: "desc" },
        })
        .then((rows) => rows.map((r) => ({ type: "proposal", id: r.id, title: `#${r.number} · ${r.title}`, subtitle: r.client.name, href: `/app/proposals/${r.id}` }))),
    );
  }
  if (allowed.includes("contract"))
    tasks.push(
      db.contract
        .findMany({ where: w({ OR: [{ title: ci }, { number: ci }] }), select: { id: true, title: true, number: true, client: { select: { name: true } } }, take: limit })
        .then((rows) => rows.map((r) => ({ type: "contract", id: r.id, title: `${r.number} · ${r.title}`, subtitle: r.client.name, href: `/app/contracts/${r.id}` }))),
    );
  if (allowed.includes("document"))
    tasks.push(
      db.document
        .findMany({ where: w({ OR: [{ name: ci }, { fileName: ci }] }), select: { id: true, name: true, fileName: true }, take: limit, orderBy: { createdAt: "desc" } })
        .then((rows) => rows.map((r) => ({ type: "document", id: r.id, title: r.name, subtitle: r.fileName, href: `/app/documents?q=${encodeURIComponent(r.name)}` }))),
    );
  if (allowed.includes("meeting"))
    tasks.push(
      db.meeting
        .findMany({ where: w({ title: ci }), select: { id: true, title: true, client: { select: { name: true } } }, take: limit, orderBy: { startsAt: "desc" } })
        .then((rows) => rows.map((r) => ({ type: "meeting", id: r.id, title: r.title, subtitle: r.client?.name, href: `/app/meetings/${r.id}` }))),
    );

  const results = await Promise.all(tasks);
  return results.flat() as SearchResult[];
}

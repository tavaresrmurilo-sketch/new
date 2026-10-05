import { NextResponse } from "next/server";
import { z } from "zod";
import { leadSchema } from "@/features/leads/schemas";
import { clientSchema } from "@/features/clients/schemas";
import { taskSchema } from "@/features/tasks/schemas";
import { ctxFromApiKey } from "@/server/auth/api-key";
import { logger } from "@/lib/logger";
import { AppError, httpStatus } from "@/server/errors";
import { createClient } from "@/server/modules/clients";
import { createLead } from "@/server/modules/leads";
import { createTask } from "@/server/modules/tasks";
import { rateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESOURCES = {
  clients: { scope: "clients", select: { id: true, name: true, kind: true, document: true, email: true, phone: true, industry: true, city: true, state: true, status: true, createdAt: true, updatedAt: true } },
  leads: { scope: "leads", select: { id: true, name: true, companyName: true, email: true, phone: true, source: true, status: true, createdAt: true, updatedAt: true } },
  opportunities: { scope: "opportunities", select: { id: true, title: true, clientId: true, value: true, probability: true, status: true, stageId: true, expectedCloseDate: true, createdAt: true, updatedAt: true } },
  projects: { scope: "projects", select: { id: true, name: true, code: true, clientId: true, status: true, progress: true, startDate: true, dueDate: true, createdAt: true, updatedAt: true } },
  tasks: { scope: "tasks", select: { id: true, title: true, status: true, priority: true, dueDate: true, assigneeId: true, projectId: true, clientId: true, createdAt: true, updatedAt: true } },
} as const;
type Resource = keyof typeof RESOURCES;

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function auth(req: Request, resource: string, write: boolean) {
  if (!(resource in RESOURCES)) return { res: err("Recurso não encontrado.", 404) };
  const r = await ctxFromApiKey(req);
  if ("error" in r) return { res: err(r.error, r.status) };
  const scope = `${RESOURCES[resource as Resource].scope}:${write ? "write" : "read"}`;
  if (!r.scopes.includes(scope)) return { res: err(`Escopo necessário: ${scope}`, 403) };
  const rl = await rateLimit(`api:${r.ctx.org.id}`, 120, 60);
  if (!rl.ok) return { res: err("Limite de requisições excedido (120/min).", 429) };
  return { ctx: r.ctx, resource: resource as Resource };
}

export async function GET(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const a = await auth(req, resource, false);
  if ("res" in a) return a.res;
  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const updatedSince = url.searchParams.get("updated_since");
  const since = updatedSince && !Number.isNaN(Date.parse(updatedSince)) ? new Date(updatedSince) : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (a.ctx.db as any)[a.resource === "clients" ? "client" : a.resource === "leads" ? "lead" : a.resource === "opportunities" ? "opportunity" : a.resource === "projects" ? "project" : "task"];
  const rows: { id: string }[] = await delegate.findMany({
    where: since ? { updatedAt: { gte: since } } : {},
    select: RESOURCES[a.resource].select,
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({ data, next_cursor: hasMore ? data[data.length - 1]!.id : null });
}

export async function POST(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (!["clients", "leads", "tasks"].includes(resource)) return err("Este recurso não aceita criação pela API.", 405);
  const a = await auth(req, resource, true);
  if ("res" in a) return a.res;
  if (a.ctx.access.level !== "FULL") return err("Workspace em modo somente leitura.", 403);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("JSON inválido.", 400);
  }
  try {
    if (resource === "clients") return NextResponse.json({ data: await createClient(a.ctx, clientSchema.parse(body)) }, { status: 201 });
    if (resource === "leads") return NextResponse.json({ data: await createLead(a.ctx, leadSchema.parse(body)) }, { status: 201 });
    return NextResponse.json({ data: await createTask(a.ctx, taskSchema.parse({ ...(body as object), assigneeId: null }), { source: "MANUAL" }) }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: "Dados inválidos.", fields: e.flatten().fieldErrors }, { status: 422 });
    if (e instanceof AppError) return err(e.message, httpStatus(e.code));
    logger.error("api_v1.failed", { resource, error: e });
    return err("Erro interno.", 500);
  }
}

import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { audit } from "@/server/audit";
import { AppError, ForbiddenError, fromPrismaError, RateLimitError, UnauthorizedError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import type { PermissionKey } from "./permissions";
import { getAuth, type AuthContext, type TenantContext } from "./session";

export function can(ctx: AuthContext, perm: PermissionKey): boolean {
  return ctx.permissions.has(perm);
}

/** Uso em Server Components/páginas. */
export async function requirePage(perm?: PermissionKey): Promise<TenantContext> {
  const ctx = await getAuth();
  if (!ctx) redirect("/login");
  if (!ctx.tenantId || !ctx.tenantName) {
    if (ctx.isPlatformAdmin) redirect("/admin");
    redirect("/login");
  }
  if (perm && !ctx.permissions.has(perm)) {
    await audit(ctx, { action: "access.denied", resource: perm, result: "DENIED" });
    redirect("/acesso-negado");
  }
  return ctx as TenantContext;
}

/** Área /admin: somente contas ADMIN. Demais usuários são registrados e enviados ao próprio dashboard. */
export async function requirePlatformAdminPage(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) redirect("/login");
  if (!ctx.isPlatformAdmin) {
    await audit(ctx, { action: "admin.access_denied", resource: "admin", result: "DENIED" });
    redirect(ctx.tenantId ? "/dashboard" : "/login");
  }
  return ctx;
}

/** APIs de administração: somente contas ADMIN fora do modo suporte. */
export async function requireAdminApi(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) throw new UnauthorizedError();
  if (!ctx.isPlatformAdmin) {
    await audit(ctx, { action: "admin.access_denied", resource: "admin", result: "DENIED" });
    throw new ForbiddenError("Acesso restrito ao administrador.");
  }
  return ctx;
}

/** Uso em Route Handlers / Server Actions. */
export async function requireApi(perm?: PermissionKey): Promise<TenantContext> {
  const ctx = await getAuth();
  if (!ctx || !ctx.tenantId) throw new UnauthorizedError();
  if (perm && !ctx.permissions.has(perm)) {
    await audit(ctx, { action: "access.denied", resource: perm, result: "DENIED" });
    throw new ForbiddenError();
  }
  return ctx as TenantContext;
}

export function enforceRateLimit(key: string, cfg: { limit: number; windowMs: number }) {
  const r = rateLimit(key, cfg.limit, cfg.windowMs);
  if (!r.allowed) throw new RateLimitError(r.retryAfterSeconds);
}

/** Proteção CSRF para métodos mutáveis: Origin deve coincidir com o host da aplicação. */
export function assertSameOrigin(req: NextRequest | Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new ForbiddenError("Origem da requisição não verificada.");
  try {
    if (new URL(origin).host !== host) throw new ForbiddenError("Origem da requisição inválida.");
  } catch (e) {
    if (e instanceof ForbiddenError) throw e;
    throw new ForbiddenError("Origem da requisição inválida.");
  }
}

type Handler<P> = (req: NextRequest, params: P) => Promise<Response>;

/** Envelopa route handlers: CSRF, tratamento de erros padronizado e logs estruturados. */
export function apiRoute<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    const started = Date.now();
    try {
      assertSameOrigin(req);
      const params = await context.params;
      return await handler(req, params);
    } catch (err) {
      // Respostas de erro padronizadas: { success: false, error, code } — sem stack trace nem detalhes internos.
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { success: false, error: err.message, code: err.code },
          { status: 429, headers: { "Retry-After": String(err.retryAfter) } },
        );
      }
      if (err instanceof AppError) {
        if (err.status === 401 || err.status === 403) logger.warn("auth.denied", { path: req.nextUrl.pathname, code: err.code });
        return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { success: false, error: "Dados inválidos.", code: "VALIDATION_ERROR", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
          { status: 422 },
        );
      }
      if (err instanceof SyntaxError && /JSON/i.test(err.message)) {
        return NextResponse.json({ success: false, error: "Corpo da requisição inválido.", code: "INVALID_JSON" }, { status: 400 });
      }
      const mapped = fromPrismaError(err);
      if (mapped) {
        const e = err as { code?: string; name?: string };
        logger.error(mapped.status === 503 ? "db.unavailable" : "db.query_failed", { path: req.nextUrl.pathname, prismaCode: e.code ?? e.name });
        return NextResponse.json({ success: false, error: mapped.message, code: mapped.code }, { status: mapped.status });
      }
      logger.error("api.unhandled_error", { path: req.nextUrl.pathname, err: err instanceof Error ? err.stack : String(err) });
      return NextResponse.json({ success: false, error: "Erro interno. A falha foi registrada; tente novamente.", code: "INTERNAL" }, { status: 500 });
    } finally {
      logger.debug("api.request", { method: req.method, path: req.nextUrl.pathname, ms: Date.now() - started });
    }
  };
}

export function clientKey(req: NextRequest, suffix: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "local";
  return `${suffix}:${ip}`;
}

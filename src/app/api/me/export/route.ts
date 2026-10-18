import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { getSessionUser } from "@/server/auth/session";
import { buildAccountExport } from "@/server/me/account";
import { requestMetaFrom } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/export — portabilidade (LGPD): todos os dados pessoais da conta
 * logada em JSON, como download. Limite: 5 por hora por conta. Auditado.
 */
export async function GET(req: Request) {
  // Download só a partir do próprio site (evita disparo por páginas de terceiros).
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para baixar seus dados." }, { status: 401 });

  // Mesmo limite de "recuperar senha" (5/h), em balde próprio.
  const rl = await rateLimit("passwordReset", `export:${user.id}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: retryMessage(rl.retryAfterSeconds) }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } });
  }

  const now = new Date();
  const data = await buildAccountExport(user.id, now);
  const meta = requestMetaFrom(req);
  await audit({ actorId: user.id, action: "user.data_exported", targetType: "User", targetId: user.id, ip: meta.ip });

  const filename = `mixtour-meus-dados-${now.toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store, private",
      "x-content-type-options": "nosniff",
    },
  });
}

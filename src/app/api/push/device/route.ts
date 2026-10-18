import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getSessionUser } from "@/server/auth/session";
import { registerDevice, unregisterDevice } from "@/server/push/native";
import { isSameOrigin, requestMetaFrom } from "@/server/request";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

// Tokens FCM (~160–200 chars) e APNs (64 hex) — limite generoso, só caracteres seguros.
const tokenSchema = z.string().trim().min(32).max(4096).regex(/^[A-Za-z0-9:_\-.]+$/);
const registerSchema = z.object({
  platform: z.enum(["ANDROID", "IOS"]),
  token: tokenSchema,
  appVersion: z.string().trim().max(32).optional(),
});

async function readJson(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > 8192) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** POST /api/push/device { platform, token, appVersion? } — liga o push nativo deste aparelho à conta logada. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Entre na sua conta para receber notificações." }, { status: 401 });
  const rl = await rateLimit("mutation", `device:${user.id}`);
  if (!rl.allowed) return NextResponse.json({ error: retryMessage(rl.retryAfterSeconds) }, { status: 429 });

  const parsed = registerSchema.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Token de notificação inválido." }, { status: 422 });

  await registerDevice(user.id, parsed.data.platform, parsed.data.token, parsed.data.appVersion);
  // Registrar o aparelho é uma ação explícita da pessoa: garante a preferência ligada.
  await prisma.user.update({ where: { id: user.id }, data: { notifyPush: true } });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/push/device { token } — desliga o push deste aparelho (ex.: ao sair da conta).
 * Não exige sessão: o próprio aparelho prova a posse do token; só remove esse token.
 */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  const rl = await rateLimit("mutation", `device-del:${requestMetaFrom(req).ip ?? "unknown"}`);
  if (!rl.allowed) return NextResponse.json({ error: retryMessage(rl.retryAfterSeconds) }, { status: 429 });
  const parsed = z.object({ token: tokenSchema }).safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "Token inválido." }, { status: 422 });
  await unregisterDevice(parsed.data.token);
  return NextResponse.json({ ok: true });
}

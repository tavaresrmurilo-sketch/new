import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { audit } from "@/server/audit";
import { exchangeGoogleCode, googleEnabled } from "@/server/auth/google";
import { createSession } from "@/server/auth/session";
import { appUrl } from "@/server/env";
import { requestMetaFrom } from "@/server/request";
import { safeEqual } from "@/server/security/crypto";
import { rateLimit } from "@/server/security/rate-limit";
import { safeNextPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (code: string) => NextResponse.redirect(appUrl(`/entrar?erro=${code}`));
  if (!googleEnabled()) return fail("google-indisponivel");

  const jar = await cookies();
  const raw = jar.get("mx_oauth")?.value;
  jar.delete({ name: "mx_oauth", path: "/api/auth/google" });
  if (!raw) return fail("google-sessao");

  let saved: { state: string; verifier: string; next: string };
  try {
    saved = JSON.parse(raw);
  } catch {
    return fail("google-sessao");
  }
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!code || !saved.state || !safeEqual(state, saved.state)) return fail("google-sessao");

  const meta = requestMetaFrom(req);
  const rl = await rateLimit("loginIp", meta.ip ?? "unknown");
  if (!rl.allowed) return fail("muitas-tentativas");

  let profile;
  try {
    profile = await exchangeGoogleCode(code, saved.verifier);
  } catch (err) {
    console.error("[oauth:google]", err);
    return fail("google-falhou");
  }

  const linked = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: profile.sub } },
    include: { user: true },
  });
  let user = linked?.user ?? null;

  if (!user) {
    const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      // Só vincula a uma conta existente se o Google atestar o e-mail.
      if (!profile.emailVerified) return fail("google-email-nao-verificado");
      user = byEmail;
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(), avatarUrl: byEmail.avatarUrl ?? profile.picture },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          avatarUrl: profile.picture,
          emailVerifiedAt: profile.emailVerified ? new Date() : null,
          termsAcceptedAt: new Date(),
        },
      });
      await audit({ actorId: user.id, action: "user.register", targetType: "User", targetId: user.id, metadata: { via: "google" }, ip: meta.ip });
    }
    await prisma.oAuthAccount.create({ data: { userId: user.id, provider: "google", providerAccountId: profile.sub } });
  }

  if (user.status !== "ACTIVE") return fail("conta-suspensa");
  await createSession(user.id, meta);
  await audit({ actorId: user.id, action: "user.login", targetType: "User", targetId: user.id, metadata: { via: "google" }, ip: meta.ip });
  return NextResponse.redirect(appUrl(safeNextPath(saved.next, "/")));
}

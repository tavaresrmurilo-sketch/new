import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleAuthUrl, googleEnabled } from "@/server/auth/google";
import { appUrl } from "@/server/env";
import { randomToken } from "@/server/security/crypto";
import { safeNextPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!googleEnabled()) return NextResponse.redirect(appUrl("/entrar?erro=google-indisponivel"));
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const next = safeNextPath(url.searchParams.get("next"), "/");
  const jar = await cookies();
  jar.set("mx_oauth", JSON.stringify({ state, verifier, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(googleAuthUrl(state, challenge));
}

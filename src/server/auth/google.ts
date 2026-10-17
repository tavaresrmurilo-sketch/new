import "server-only";
import { appUrl, env, integrations } from "@/server/env";

/**
 * Login com Google (OAuth 2.0 + OpenID Connect, fluxo authorization code com PKCE).
 * Fica disponível somente com GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET configurados.
 */
export function googleEnabled() {
  return integrations().google;
}

export function googleRedirectUri() {
  return appUrl("/api/auth/google/callback");
}

export function googleAuthUrl(state: string, codeChallenge: string) {
  const params = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<GoogleProfile> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env().GOOGLE_CLIENT_ID!,
      client_secret: env().GOOGLE_CLIENT_SECRET!,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const tokens = (await res.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("Google não retornou access_token");

  // userinfo via HTTPS direto do Google, autenticado pelo access_token recém-emitido.
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!info.ok) throw new Error(`Google userinfo failed (${info.status})`);
  const p = (await info.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!p.sub || !p.email) throw new Error("Perfil do Google sem e-mail");
  return {
    sub: p.sub,
    email: p.email.toLowerCase(),
    emailVerified: Boolean(p.email_verified),
    name: p.name?.slice(0, 80) || p.email.split("@")[0],
    picture: p.picture ?? null,
  };
}

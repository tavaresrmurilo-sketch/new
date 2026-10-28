import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Verificação otimista: sem cookie de sessão, redireciona para o login.
 * A validação real da sessão (assinatura, expiração, empresa) acontece no
 * servidor, em cada layout, Server Action e Route Handler.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/entrar", request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/painel/:path*",
    "/retornos/:path*",
    "/clientes/:path*",
    "/atendimentos/:path*",
    "/servicos/:path*",
    "/mensagens/:path*",
    "/relatorios/:path*",
    "/configuracoes/:path*",
    "/onboarding/:path*",
  ],
};

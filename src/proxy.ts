import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["__Host-mx_session", "mx_session"];

/**
 * Barreira leve de navegação: sem cookie de sessão, áreas privadas redirecionam
 * para o login. A autorização real acontece no servidor (getSessionUser/guards).
 */
export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((c) => request.cookies.has(c));
  if (!hasSession) {
    const url = request.nextUrl.clone();
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/entrar";
    url.search = `?next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/painel/:path*", "/admin/:path*", "/salvos", "/notificacoes", "/perfil/:path*", "/perfil"],
};

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIES = ["__Host-cortex_session", "cortex_session"];

/**
 * Barreira leve na borda: rotas protegidas sem cookie de sessão vão para o login.
 * A validação real (expiração, bloqueio, tenant, permissões) acontece no servidor a cada requisição.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = SESSION_COOKIES.some((c) => req.cookies.get(c)?.value);
  if (!hasSession && (pathname.startsWith("/app") || pathname.startsWith("/admin"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*"],
};

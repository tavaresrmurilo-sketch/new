import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/registrar", "/api/auth/login", "/api/auth/register", "/api/health", "/api/jobs/run"];

/** Barreira leve na borda: sem cookie de sessão → login. A validação completa ocorre no servidor (getAuth). */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const hasSession = Boolean(req.cookies.get("jrc_session")?.value);
  if (!hasSession) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ success: false, error: "Não autenticado.", code: "UNAUTHORIZED" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};

export interface NavUser {
  name: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  hasOrganization: boolean;
  emailVerified: boolean;
}

/** Rotas em que a barra inferior móvel não aparece (têm navegação própria ou CTA fixo). */
export const HIDE_BOTTOM_NAV = [/^\/evento\//, /^\/painel/, /^\/admin/, /^\/entrar/, /^\/cadastrar/, /^\/recuperar-senha/, /^\/redefinir-senha/, /^\/verificar-email/, /^\/convite/];

export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

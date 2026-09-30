/** Nome do cookie de sessão do painel. Em produção usa o prefixo __Host- (exige HTTPS, sem Domain). */
export const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-chx_admin" : "chx_admin";

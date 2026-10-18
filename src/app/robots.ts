import type { MetadataRoute } from "next";

const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Áreas privadas, APIs e redirecionamentos rastreados ficam fora dos buscadores. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/painel",
          "/admin",
          "/api/",
          "/perfil",
          "/salvos",
          "/notificacoes",
          "/r/",
          "/convite",
          "/redefinir-senha",
          "/verificar-email",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}

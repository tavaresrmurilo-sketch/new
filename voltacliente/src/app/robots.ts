import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/planos", "/suporte", "/privacidade", "/termos"],
        disallow: [
          "/api/",
          "/painel",
          "/retornos",
          "/clientes",
          "/atendimentos",
          "/servicos",
          "/mensagens",
          "/relatorios",
          "/configuracoes",
          "/onboarding",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}

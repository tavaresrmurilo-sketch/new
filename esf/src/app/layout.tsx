import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { links, site } from "@/content/site";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/manrope-latin-var.woff2",
  variable: "--font-manrope",
  weight: "200 800",
  display: "swap",
  preload: true,
});

const instrument = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument",
  display: "swap",
  preload: true,
});

const title = "ESF — Empreendendo Sem Fronteiras";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: title, template: `%s · ESF` },
  description: site.description,
  applicationName: title,
  authors: [{ name: title }],
  keywords: [
    "ESF",
    "Empreendendo Sem Fronteiras",
    "refugiados",
    "imigrantes",
    "empreendedorismo",
    "inclusão",
    "integração",
    "voluntariado",
    "Brasília",
    "Brasil",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: title,
    title,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: site.description,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
  category: "nonprofit",
};

export const viewport: Viewport = {
  themeColor: "#050e19",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

/**
 * Define o modo de movimento antes da primeira pintura (evita "flash" de layout):
 * - "full": abertura cinematográfica controlada pelo scroll;
 * - "reduced": composição estática para quem prefere menos movimento.
 * Sem JavaScript, o atributo não existe e o layout estático é usado.
 */
const motionScript = `(function(){try{var d=document.documentElement;var r=window.matchMedia("(prefers-reduced-motion: reduce)").matches;d.setAttribute("data-motion",r?"reduced":"full");}catch(e){}})();`;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: title,
  alternateName: site.fullName,
  url: siteUrl(),
  description: site.description,
  email: site.email,
  address: {
    "@type": "PostalAddress",
    addressLocality: site.location.city,
    addressRegion: site.location.region,
    addressCountry: "BR",
  },
  sameAs: [links.bioSite],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionScript }} />
      </head>
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}

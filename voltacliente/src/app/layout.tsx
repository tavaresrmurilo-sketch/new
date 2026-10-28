import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/app/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "VoltaCliente — Clientes que voltam. Negócios que crescem.",
    template: "%s · VoltaCliente",
  },
  description:
    "Plataforma para pequenas empresas recuperarem clientes antigos: registre atendimentos, saiba quem precisa de um novo serviço e chame pelo WhatsApp com mensagens personalizadas.",
  applicationName: "VoltaCliente",
  openGraph: {
    title: "VoltaCliente — Clientes que voltam. Negócios que crescem.",
    description: "Seu próximo cliente pode ser alguém que já comprou de você.",
    locale: "pt_BR",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfe" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" suppressHydrationWarning className={`${inter.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

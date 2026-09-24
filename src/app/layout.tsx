import type { Metadata } from "next";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "JR Cortex AI", template: "%s · JR Cortex AI" },
  description: "Transforme os dados da sua empresa em decisões. Inteligência empresarial conectada aos seus dados — JR Consultorias.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

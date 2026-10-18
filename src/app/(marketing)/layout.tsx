import { getNavUser } from "@/components/layout/app-shell";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { MarketingMobileHeader } from "@/components/marketing/marketing-header";

/** Páginas institucionais: cabeçalho do site, conteúdo e rodapé (sem a barra inferior do app). */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { user, unread } = await getNavUser();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader user={user} unread={unread} />
      <MarketingMobileHeader user={user} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}

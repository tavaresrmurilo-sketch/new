import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import type { NavUser } from "@/components/layout/nav-items";
import { ThemeIconButton } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

/** Topo das páginas institucionais no celular (no desktop vale o SiteHeader). */
export function MarketingMobileHeader({ user }: { user: NavUser | null }) {
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl lg:hidden">
      <div className="flex h-14 items-center justify-between gap-2 px-4">
        <Link href="/" aria-label="Mixtour — início" className="flex h-11 items-center">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeIconButton className="grid size-11 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground" />
          {user ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/painel">Painel</Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" size="sm">
              <Link href="/entrar">Entrar</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

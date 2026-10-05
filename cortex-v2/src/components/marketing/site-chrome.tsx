import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { isDemoModeEnabled } from "@/lib/env";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" aria-label="JR Córtex — início"><Logo /></Link>
        <nav className="hidden flex-1 gap-5 text-sm text-muted-foreground md:flex">
          <Link href="/#como-funciona" className="hover:text-foreground">Como funciona</Link>
          <Link href="/#cortex-ai" className="hover:text-foreground">Córtex AI</Link>
          <Link href="/#seguranca" className="hover:text-foreground">Segurança</Link>
          <Link href="/pricing" className="hover:text-foreground">Planos</Link>
          <Link href="/#faq" className="hover:text-foreground">FAQ</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-sm hover:bg-accent">Entrar</Link>
          <Link href="/register" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Começar agora</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm text-muted-foreground">
        <Logo />
        <span>© {new Date().getFullYear()} JR Córtex</span>
        <nav className="ml-auto flex gap-4">
          <Link href="/pricing" className="hover:text-foreground">Planos</Link>
          {isDemoModeEnabled() ? <Link href="/demo" className="hover:text-foreground">Demonstração</Link> : null}
          <Link href="/privacy" className="hover:text-foreground">Privacidade</Link>
          <Link href="/terms" className="hover:text-foreground">Termos</Link>
        </nav>
      </div>
    </footer>
  );
}

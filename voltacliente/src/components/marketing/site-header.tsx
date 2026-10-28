"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MenuIcon } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#recursos", label: "Recursos" },
  { href: "/#segmentos", label: "Segmentos" },
  { href: "/planos", label: "Planos" },
  { href: "/#duvidas", label: "Dúvidas" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("sticky top-0 z-40 transition-all", scrolled ? "border-b bg-background/85 backdrop-blur-md" : "bg-transparent")}>
      <div className="container-page flex h-16 items-center gap-6">
        <Logo />
        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Principal">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/entrar">Entrar</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/cadastro">Começar gratuitamente</Link>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-6">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SheetDescription className="sr-only">Navegação do site</SheetDescription>
              <nav className="mt-8 flex flex-col gap-1" aria-label="Menu">
                {LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-3 text-base font-medium hover:bg-accent"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto grid gap-2">
                <Button asChild variant="outline" size="lg">
                  <Link href="/entrar">Entrar</Link>
                </Button>
                <Button asChild size="lg">
                  <Link href="/cadastro">Começar gratuitamente</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

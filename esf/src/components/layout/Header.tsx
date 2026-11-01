"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { links, nav, site } from "@/content/site";
import { Wordmark } from "@/components/brand/Logo";

export function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  }, []);

  /* ---------- tom, visibilidade e fundo conforme o scroll ---------- */
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      const delta = y - lastY;
      if (Math.abs(delta) > 6) {
        header.dataset.hidden = String(delta > 0 && y > 160 && !openRef.current);
        lastY = y;
      }
      if (y < 40) header.dataset.hidden = "false";

      const intro = document.getElementById("inicio");
      const introEnd = intro ? intro.offsetTop + intro.offsetHeight - header.offsetHeight : 0;
      header.dataset.solid = String(y > introEnd - 2);

      if (!openRef.current) {
        const probe = document
          .elementsFromPoint(window.innerWidth / 2, header.offsetHeight / 2)
          .find((el) => !header.contains(el) && !menuRef.current?.contains(el));
        const tone = probe?.closest<HTMLElement>("[data-tone]")?.dataset.tone ?? "dark";
        header.dataset.tone = tone;
      } else {
        header.dataset.tone = "dark";
      }
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // a abertura avisa quando muda de tom (o scrub pode assentar depois do último evento de scroll)
    window.addEventListener("esf:tone", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("esf:tone", onScroll);
    };
  }, []);

  /* ---------- seção atual (aria-current) ---------- */
  useEffect(() => {
    const ids = nav.map((n) => n.href.slice(1));
    const sections = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setCurrent(e.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    const onScroll = () => {
      const first = sections[0];
      if (first && window.scrollY + window.innerHeight * 0.5 < first.offsetTop) setCurrent(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  /* ---------- menu mobile: travar scroll, Esc, foco ---------- */
  useEffect(() => {
    openRef.current = open;
    const header = headerRef.current;
    if (header) {
      header.dataset.hidden = "false";
      if (open) header.dataset.tone = "dark";
    }
    if (!open) return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    const menu = menuRef.current;
    const focusables = () =>
      Array.from(menu?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []).concat(
        buttonRef.current ? [buttonRef.current] : [],
      );
    const firstLink = menu?.querySelector<HTMLElement>("a[href]");
    const t = window.setTimeout(() => firstLink?.focus({ preventScroll: true }), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const mq = window.matchMedia("(min-width: 1024px)");
    const onMq = () => mq.matches && close(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    return () => {
      window.clearTimeout(t);
      html.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [open, close]);

  return (
    <>
      <a
        href="#quem-somos"
        className="sr-only-focusable fixed left-4 top-4 z-[60] rounded-full bg-paper px-5 py-3 text-sm font-bold text-ink shadow-lg"
      >
        Pular para o conteúdo
      </a>

      <header ref={headerRef} className="site-header" data-tone="dark" data-hidden="false" data-solid="false">
        <a href="#inicio" className="mr-auto rounded-lg">
          <Wordmark />
          <span className="sr-only"> — voltar ao início</span>
        </a>

        <nav aria-label="Principal" className="hidden lg:block">
          <ul className="flex items-center gap-7">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="nav-link"
                  aria-current={current === item.href.slice(1) ? "true" : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a href="#faca-parte" className="header-cta hidden sm:inline-flex">
          Faça parte
        </a>

        <button
          ref={buttonRef}
          type="button"
          className="menu-button lg:hidden"
          aria-expanded={open}
          aria-controls="menu-mobile"
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? "Fechar" : "Menu"}</span>
          <span className="menu-icon" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </header>

      <div
        ref={menuRef}
        id="menu-mobile"
        className="mobile-menu lg:hidden"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        inert={!open}
      >
        <nav aria-label="Menu móvel">
          <ul>
            {[...nav, { href: "#faca-parte", label: "Faça parte" }].map((item, i) => (
              <li key={item.href} style={{ ["--i" as string]: i }}>
                <a href={item.href} onClick={() => close(false)}>
                  <span className="num">0{i + 1}</span>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mobile-menu-foot mt-auto grid gap-5 pt-10">
          <div className="grid gap-3 sm:grid-cols-2">
            <a className="btn btn-ember" href={links.volunteerForm} target="_blank" rel="noopener noreferrer">
              Seja voluntário
            </a>
            <a className="btn btn-ghost-light" href="#faca-parte" onClick={() => close(false)}>
              Apoie a ESF
            </a>
          </div>
          <p className="text-sm text-mist">
            <a href={links.mailto} className="link-underline text-paper">
              {site.email}
            </a>
            <br />
            {site.location.city} — {site.location.region}, {site.location.country}
          </p>
        </div>
      </div>
    </>
  );
}

"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/cn";

export const OPEN_SEARCH_EVENT = "chavix:open-search";

export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

interface Results {
  products: Array<{ slug: string; name: string; categoryName: string; finalPriceCents: number; thumbUrl: string | null }>;
  categories: Array<{ slug: string; name: string }>;
}

const SUGGESTIONS = ["nome", "games", "pet", "coração", "minimalista"];

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ products: [], categories: [] });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      controller.current?.abort();
      return;
    }
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (res.ok) {
          setResults(await res.json());
          setActive(-1);
        }
      } catch {
        /* requisição cancelada */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  const hasQuery = query.trim().length >= 2;
  const shown = hasQuery ? results : { products: [], categories: [] };

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const count = shown.products.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(count - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && shown.products[active]) go(`/produto/${shown.products[active].slug}`);
      else if (query.trim()) go(`/produtos?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setActive(-1);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content className="pop fixed inset-x-0 top-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-pop sm:top-[10vh] sm:rounded-2xl">
          <Dialog.Title className="sr-only">Buscar chaveiros</Dialog.Title>
          <Dialog.Description className="sr-only">Digite para ver resultados instantâneos</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            {loading ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted" /> : <Search className="h-5 w-5 shrink-0 text-muted" />}
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar chaveiros, temas, cores…"
              className="h-16 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
              aria-label="Buscar"
              role="combobox"
              aria-expanded={shown.products.length > 0}
              aria-controls="search-results"
              aria-activedescendant={active >= 0 ? `search-result-${active}` : undefined}
              enterKeyHint="search"
            />
            <Dialog.Close className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-sunken" aria-label="Fechar busca">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 overflow-y-auto p-2" id="search-results" role="listbox">
            {!hasQuery && (
              <div className="p-3">
                <p className="spec text-muted">Buscas rápidas</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => setQuery(s)} className="rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 hover:border-ink/30 hover:text-ink">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasQuery && shown.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-2 pb-3">
                {shown.categories.map((c) => (
                  <Link key={c.slug} href={`/categoria/${c.slug}`} onClick={() => setOpen(false)} className="rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent">
                    {c.name}
                  </Link>
                ))}
              </div>
            )}

            {hasQuery && shown.products.length > 0 && (
              <ul className="space-y-0.5">
                {shown.products.map((p, i) => (
                  <li key={p.slug} id={`search-result-${i}`} role="option" aria-selected={active === i}>
                    <Link
                      href={`/produto/${p.slug}`}
                      onClick={() => setOpen(false)}
                      onMouseEnter={() => setActive(i)}
                      className={cn("flex items-center gap-3 rounded-lg p-2 transition-colors", active === i ? "bg-sunken" : "hover:bg-sunken")}
                    >
                      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-sunken">
                        {p.thumbUrl && <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" width={48} height={48} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="spec text-muted">{p.categoryName}</span>
                      </span>
                      <span className="text-sm font-semibold tabular-nums">{formatBRL(p.finalPriceCents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {hasQuery && !loading && shown.products.length === 0 && shown.categories.length === 0 && (
              <div className="px-3 py-8 text-center">
                <p className="font-medium">Nada com “{query.trim()}” por aqui.</p>
                <p className="mt-1 text-sm text-muted">Não encontrou o seu? A gente cria.</p>
                <button type="button" onClick={() => go("/personalizar")} className="mt-4 text-sm font-medium text-accent hover:underline">
                  Criar um chaveiro personalizado →
                </button>
              </div>
            )}

            {hasQuery && (
              <button
                type="button"
                onClick={() => go(`/produtos?q=${encodeURIComponent(query.trim())}`)}
                className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm text-ink-2 hover:bg-sunken"
              >
                Ver todos os resultados para “{query.trim()}”
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

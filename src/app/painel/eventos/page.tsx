import { CalendarPlus, ChevronLeft, ChevronRight, Plus, Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EventRow } from "@/components/painel/event-row";
import { PainelPage } from "@/components/painel/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { boostsUsedThisMonth, getPlan } from "@/server/billing/plans";
import { filterCounts, isPanelFilter, listOrgEvents, PANEL_FILTERS, type PanelFilter } from "@/server/events/organizer-queries";
import { requireCurrentOrg } from "@/server/organizations/current";

export const metadata: Metadata = { title: "Eventos" };

const EMPTY_COPY: Record<PanelFilter, string> = {
  todos: "Crie seu primeiro evento — você pode salvar como rascunho e publicar quando estiver pronto.",
  rascunho: "Nenhum rascunho. Eventos salvos sem publicar aparecem aqui.",
  analise: "Nenhum evento aguardando análise da equipe Mixtour.",
  publicados: "Nenhum evento no ar agora. Publique um evento para ele aparecer no mapa.",
  encerrados: "Eventos que já aconteceram aparecem aqui, com as estatísticas guardadas.",
  cancelados: "Nenhum evento cancelado.",
  recusados: "Nenhum evento recusado. Se a moderação pedir ajustes, eles aparecem aqui.",
};

export default async function EventosPage({ searchParams }: PageProps<"/painel/eventos">) {
  const { org } = await requireCurrentOrg();
  const sp = await searchParams;
  const filter: PanelFilter = isPanelFilter(sp.status) ? sp.status : "todos";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Number(sp.pagina) || 1);
  const now = new Date();

  const [counts, list, plan, boostsUsed] = await Promise.all([
    filterCounts(org.id, now),
    listOrgEvents(org.id, { filter, q, page, now }),
    getPlan(org.plan),
    boostsUsedThisMonth(org.id),
  ]);
  const quota = { limit: plan.boostsPerMonth, used: boostsUsed };

  const href = (next: { status?: PanelFilter; pagina?: number }) => {
    const p = new URLSearchParams();
    const st = next.status ?? filter;
    if (st !== "todos") p.set("status", st);
    if (q) p.set("q", q);
    if (next.pagina && next.pagina > 1) p.set("pagina", String(next.pagina));
    const s = p.toString();
    return `/painel/eventos${s ? `?${s}` : ""}`;
  };

  return (
    <PainelPage>
      <PageHeader
        title="Eventos"
        description={counts.todos ? `${counts.todos} ${counts.todos === 1 ? "evento" : "eventos"} em ${org.name}` : "Tudo o que sua organização publica no Mixtour."}
        actions={
          <Button asChild variant="primary">
            <Link href="/painel/eventos/novo">
              <Plus /> Novo evento
            </Link>
          </Button>
        }
      />

      {counts.todos > 0 && (
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Filtrar por status" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {PANEL_FILTERS.map((f) => {
              const active = f.value === filter;
              const n = counts[f.value];
              if (!active && n === 0 && f.value !== "todos") return null;
              return (
                <Link
                  key={f.value}
                  href={href({ status: f.value })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                    active ? "border-transparent bg-foreground text-background" : "border-border bg-surface text-foreground hover:border-border-strong",
                  )}
                >
                  {f.label}
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-background/20" : "bg-surface-2 text-muted-foreground")}>{n}</span>
                </Link>
              );
            })}
          </nav>
          <form method="get" action="/painel/eventos" role="search" className="relative lg:w-72">
            {filter !== "todos" && <input type="hidden" name="status" value={filter} />}
            <label htmlFor="busca-eventos" className="sr-only">
              Buscar eventos pelo nome
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="busca-eventos" name="q" type="search" defaultValue={q} placeholder="Buscar pelo nome" className="h-11 pl-11" maxLength={100} />
          </form>
        </div>
      )}

      <div className="mt-5">
        {list.items.length ? (
          <>
            <ul className="flex flex-col gap-2.5">
              {list.items.map((e) => (
                <EventRow key={e.id} event={e} quota={quota} now={now} />
              ))}
            </ul>
            {list.pages > 1 && (
              <nav aria-label="Paginação" className="mt-6 flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  Página {list.page} de {list.pages}
                </span>
                <div className="flex gap-2">
                  {list.page > 1 && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={href({ pagina: list.page - 1 })}>
                        <ChevronLeft /> Anterior
                      </Link>
                    </Button>
                  )}
                  {list.page < list.pages && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={href({ pagina: list.page + 1 })}>
                        Próxima <ChevronRight />
                      </Link>
                    </Button>
                  )}
                </div>
              </nav>
            )}
          </>
        ) : q ? (
          <Card>
            <EmptyState
              icon={<SearchX />}
              title={`Nada encontrado para “${q}”`}
              description="Confira a grafia ou busque por outra palavra do nome do evento."
              action={
                <Button asChild variant="secondary">
                  <Link href={filter !== "todos" ? `/painel/eventos?status=${filter}` : "/painel/eventos"}>Limpar busca</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={<CalendarPlus />}
              title={counts.todos ? "Nada por aqui" : "Publique seu primeiro evento"}
              description={EMPTY_COPY[filter]}
              action={
                <Button asChild variant="primary">
                  <Link href="/painel/eventos/novo">
                    <Plus /> Criar evento
                  </Link>
                </Button>
              }
            />
          </Card>
        )}
      </div>
    </PainelPage>
  );
}

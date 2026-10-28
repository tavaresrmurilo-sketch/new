import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClockIcon,
  BellRingIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CheckCheckIcon,
  PartyPopperIcon,
  XCircleIcon,
} from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, pageParam, stringParam } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { ReturnCard } from "@/components/returns/return-card";
import { cn, formatNumber } from "@/lib/utils";
import { RETURN_TABS, type ReturnTab } from "@/modules/returns/schema";
import { getReturnCounts, listReturns, UPCOMING_WINDOW_DAYS } from "@/modules/returns/service";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Central de retornos" };

const TAB_INFO: Record<ReturnTab, { label: string; icon: typeof BellRingIcon; empty: string; emptyText: string }> = {
  hoje: { label: "Hoje", icon: CalendarClockIcon, empty: "Nenhum retorno para hoje", emptyText: "Confira os atrasados e os próximos." },
  atrasados: {
    label: "Atrasados",
    icon: AlarmClockIcon,
    empty: "Nenhum retorno atrasado",
    emptyText: "Ótimo! Todos os contatos estão em dia.",
  },
  proximos: {
    label: "Próximos",
    icon: CalendarCheckIcon,
    empty: "Nenhum retorno nos próximos dias",
    emptyText: `Retornos previstos para os próximos ${UPCOMING_WINDOW_DAYS} dias aparecem aqui.`,
  },
  contatados: {
    label: "Contatados",
    icon: CheckCheckIcon,
    empty: "Nenhum cliente aguardando",
    emptyText: "Clientes contatados que ainda não voltaram aparecem aqui.",
  },
  convertidos: {
    label: "Convertidos",
    icon: PartyPopperIcon,
    empty: "Nenhum retorno convertido ainda",
    emptyText: "Quando o cliente voltar, registre o atendimento com “Registrar retorno”.",
  },
  encerrados: {
    label: "Encerrados",
    icon: XCircleIcon,
    empty: "Nenhum retorno encerrado",
    emptyText: "Retornos encerrados sem novo atendimento aparecem aqui.",
  },
};

export default async function ReturnsPage({ searchParams }: PageProps<"/retornos">) {
  const tenant = await requireTenantPage();
  const params = await searchParams;
  const counts = await getReturnCounts(tenant);
  const requested = stringParam(params.aba);
  const tab: ReturnTab = (RETURN_TABS as readonly string[]).includes(requested)
    ? (requested as ReturnTab)
    : counts.hoje > 0
      ? "hoje"
      : counts.atrasados > 0
        ? "atrasados"
        : "proximos";
  const q = stringParam(params.q);
  const data = await listReturns(tenant, { tab, q, page: pageParam(params.pagina) });
  const info = TAB_INFO[tab];

  return (
    <div className="animate-fade-up">
      <PageHeader title="Central de retornos" description="Quem precisa de um novo atendimento, com a mensagem pronta para o WhatsApp." />

      <nav aria-label="Situação dos retornos" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl bg-muted p-1 sm:w-fit">
          {RETURN_TABS.map((key) => {
            const Icon = TAB_INFO[key].icon;
            const active = key === tab;
            return (
              <li key={key}>
                <Link
                  href={`/retornos?aba=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                    active && "bg-card text-foreground shadow-sm",
                  )}
                >
                  <Icon className="size-4" />
                  {TAB_INFO[key].label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                      active ? "bg-primary text-primary-foreground" : "bg-background",
                      key === "atrasados" && counts.atrasados > 0 && !active && "bg-warning-soft text-warning-soft-foreground",
                    )}
                  >
                    {formatNumber(counts[key])}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <SearchInput placeholder="Buscar cliente nesta lista" className="mb-4 max-w-md" />

      {data.items.length === 0 ? (
        <EmptyState
          icon={info.icon}
          title={q ? "Nenhum cliente encontrado" : info.empty}
          description={q ? "Tente outro nome." : info.emptyText}
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {data.items.map((item) => (
            <ReturnCard key={item.id} item={item} today={data.today} />
          ))}
        </div>
      )}
      <Pagination page={data.page} pageCount={data.pageCount} total={data.total} basePath="/retornos" params={{ ...params, aba: tab }} />
    </div>
  );
}

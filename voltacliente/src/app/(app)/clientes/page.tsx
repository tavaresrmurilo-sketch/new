import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon, DownloadIcon, UploadIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, pageParam, stringParam } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { ConsentBadge } from "@/components/app/status-badges";
import { UrlSelect } from "@/components/app/url-select";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateShort, relativeDayLabel, todayIn } from "@/lib/dates";
import { CUSTOMER_FILTERS, CUSTOMER_SORTS, type CustomerFilter, type CustomerSort } from "@/modules/customers/schema";
import { listCustomers } from "@/modules/customers/service";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Clientes" };

const FILTER_OPTIONS: { value: CustomerFilter; label: string }[] = [
  { value: "todos", label: "Todos os clientes" },
  { value: "retorno-pendente", label: "Com retorno pendente" },
  { value: "com-consentimento", label: "Com consentimento" },
  { value: "sem-consentimento", label: "Sem consentimento" },
  { value: "nao-contatar", label: "Não contatar" },
];

const SORT_OPTIONS: { value: CustomerSort; label: string }[] = [
  { value: "nome", label: "Nome (A–Z)" },
  { value: "recentes", label: "Cadastrados recentemente" },
  { value: "antigos", label: "Clientes mais antigos" },
];

export default async function CustomersPage({ searchParams }: PageProps<"/clientes">) {
  const tenant = await requireTenantPage();
  const params = await searchParams;
  const q = stringParam(params.q);
  const filter = (CUSTOMER_FILTERS as readonly string[]).includes(stringParam(params.filtro))
    ? (stringParam(params.filtro) as CustomerFilter)
    : "todos";
  const sort = (CUSTOMER_SORTS as readonly string[]).includes(stringParam(params.ordem))
    ? (stringParam(params.ordem) as CustomerSort)
    : "nome";
  const data = await listCustomers(tenant, { q, filter, sort, page: pageParam(params.pagina) });
  const today = todayIn(tenant.timezone);
  const filtered = q !== "" || filter !== "todos";

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Clientes"
        description="Sua carteira de clientes, com histórico e próximos retornos."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/api/exportar/clientes" download>
                <DownloadIcon /> Exportar
              </a>
            </Button>
            <Button asChild variant="outline">
              <Link href="/clientes/importar">
                <UploadIcon /> Importar CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/clientes/novo">
                <UserPlusIcon /> Novo cliente
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput placeholder="Buscar por nome, telefone ou e-mail" className="flex-1" />
        <UrlSelect param="filtro" value={filter} defaultValue="todos" options={FILTER_OPTIONS} label="Filtrar clientes" />
        <UrlSelect param="ordem" value={sort} defaultValue="nome" options={SORT_OPTIONS} label="Ordenar clientes" />
      </div>

      {data.items.length === 0 ? (
        filtered ? (
          <EmptyState icon={UsersIcon} title="Nenhum cliente encontrado" description="Tente outra busca ou remova os filtros." />
        ) : (
          <EmptyState
            icon={UsersIcon}
            title="Cadastre seus primeiros clientes"
            description="Adicione um a um ou importe uma planilha CSV com nome e telefone."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline">
                  <Link href="/clientes/importar">
                    <UploadIcon /> Importar CSV
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/clientes/novo">
                    <UserPlusIcon /> Novo cliente
                  </Link>
                </Button>
              </div>
            }
          />
        )
      ) : (
        <>
          <Card className="hidden py-0 md:flex">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Último atendimento</TableHead>
                  <TableHead>Próximo retorno</TableHead>
                  <TableHead>Mensagens</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="pl-5">
                      <Link href={`/clientes/${c.id}`} className="flex items-center gap-3">
                        <Avatar name={c.name} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium group-hover:underline">{c.name}</span>
                          {c.email && <span className="block truncate text-xs text-muted-foreground">{c.email}</span>}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{c.phone}</TableCell>
                    <TableCell>
                      {c.lastAppointment ? (
                        <span className="text-sm">
                          {formatDateShort(c.lastAppointment.date)}
                          <span className="block max-w-48 truncate text-xs text-muted-foreground">{c.lastAppointment.serviceName}</span>
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.nextReturn ? (
                        <Badge variant={c.nextReturn.date < today ? "warning" : c.nextReturn.date === today ? "success" : "info"}>
                          {c.nextReturn.status === "CONTACTED" ? "Contatado" : relativeDayLabel(c.nextReturn.date, today)}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ConsentBadge consent={c.marketingConsent} doNotContact={c.doNotContact} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/clientes/${c.id}`} aria-label={`Ver ${c.name}`} className="text-muted-foreground hover:text-foreground">
                        <ChevronRightIcon className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="space-y-2 md:hidden">
            {data.items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clientes/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs active:bg-accent"
                >
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{c.phone}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {c.nextReturn && (
                        <Badge variant={c.nextReturn.date < today ? "warning" : "info"}>
                          Retorno: {relativeDayLabel(c.nextReturn.date, today)}
                        </Badge>
                      )}
                      <ConsentBadge consent={c.marketingConsent} doNotContact={c.doNotContact} />
                    </div>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pagination page={data.page} pageCount={data.pageCount} total={data.total} basePath="/clientes" params={params} />
    </div>
  );
}

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { buildHref, type SearchParams } from "@/lib/list-params";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
}

/**
 * Tabela renderizada no servidor. Ordenação e paginação são links (URL) — funcionam sem JavaScript
 * e consultam apenas a página atual no banco.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  pathname,
  searchParams,
  sort,
  dir,
  empty,
  rowHref,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  pathname: string;
  searchParams: SearchParams;
  sort?: string;
  dir?: "asc" | "desc";
  empty?: React.ReactNode;
  rowHref?: (row: T) => string;
  className?: string;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className={cn("overflow-hidden rounded-lg border bg-card", className)}>
      <Table>
        <THead>
          <TR className="hover:bg-transparent">
            {columns.map((col) => {
              const active = sort === col.key;
              const nextDir = active && dir === "desc" ? "asc" : "desc";
              const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <TH
                  key={col.key}
                  className={cn(col.align === "right" && "text-right", col.align === "center" && "text-center", col.headerClassName)}
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {col.sortable ? (
                    <Link
                      href={buildHref(pathname, searchParams, { sort: col.key, dir: nextDir, page: null })}
                      className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                      scroll={false}
                    >
                      {col.header}
                      <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
                    </Link>
                  ) : (
                    col.header
                  )}
                </TH>
              );
            })}
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id} className={cn(rowHref && "relative")}>
              {columns.map((col, i) => (
                <TD
                  key={col.key}
                  className={cn(col.align === "right" && "text-right tabular", col.align === "center" && "text-center", col.className)}
                >
                  {i === 0 && rowHref ? (
                    <Link href={rowHref(row)} className="font-medium hover:underline">
                      {col.cell(row)}
                    </Link>
                  ) : (
                    col.cell(row)
                  )}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function Pagination({
  pathname,
  searchParams,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  searchParams: SearchParams;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = (p: number) => buildHref(pathname, searchParams, { page: p === 1 ? null : p });
  return (
    <nav className="flex items-center justify-between gap-3 pt-3 text-[13px] text-muted-foreground" aria-label="Paginação">
      <span className="tabular">
        {formatNumber(from)}–{formatNumber(to)} de {formatNumber(total)}
      </span>
      <div className="flex items-center gap-1">
        <PageLink href={link(page - 1)} disabled={page <= 1} label="Página anterior">
          <ChevronLeft className="size-4" />
        </PageLink>
        <span className="tabular px-2">
          {page} / {pages}
        </span>
        <PageLink href={link(page + 1)} disabled={page >= pages} label="Próxima página">
          <ChevronRight className="size-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="inline-flex size-8 items-center justify-center rounded-md border opacity-40" aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} scroll={false} className="inline-flex size-8 items-center justify-center rounded-md border hover:bg-accent">
      {children}
    </Link>
  );
}

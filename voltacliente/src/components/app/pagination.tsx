import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  total,
  basePath,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
}) {
  if (pageCount <= 1) return <p className="pt-4 text-sm text-muted-foreground">{formatNumber(total)} registro(s)</p>;
  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "pagina") search.set(key, value);
    }
    if (target > 1) search.set("pagina", String(target));
    return `${basePath}${search.size ? `?${search}` : ""}`;
  };
  return (
    <nav className="flex items-center justify-between gap-3 pt-4" aria-label="Paginação">
      <p className="text-sm text-muted-foreground">
        Página {page} de {pageCount} · {formatNumber(total)} registro(s)
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" aria-disabled={page <= 1} className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
          <Link href={href(page - 1)} scroll={false}>
            <ChevronLeftIcon /> Anterior
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={page >= pageCount}
          className={page >= pageCount ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={href(page + 1)} scroll={false}>
            Próxima <ChevronRightIcon />
          </Link>
        </Button>
      </div>
    </nav>
  );
}

export function pageParam(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function stringParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

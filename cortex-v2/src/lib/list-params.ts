export type SearchParams = Record<string, string | string[] | undefined>;

export interface ListParams {
  page: number;
  pageSize: number;
  q: string;
  sort: string;
  dir: "asc" | "desc";
  get(key: string): string | undefined;
  getAll(key: string): string[];
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Lê paginação, busca, ordenação e filtros da URL (listas paginadas no servidor). */
export function parseListParams(
  sp: SearchParams,
  opts: { sortable: string[]; defaultSort: string; defaultDir?: "asc" | "desc"; pageSize?: number },
): ListParams {
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const size = Number(first(sp.size));
  const pageSize = [10, 25, 50, 100].includes(size) ? size : (opts.pageSize ?? 25);
  const sortRaw = first(sp.sort);
  const sort = sortRaw && opts.sortable.includes(sortRaw) ? sortRaw : opts.defaultSort;
  const dirRaw = first(sp.dir);
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : (opts.defaultDir ?? "desc");
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  return {
    page,
    pageSize,
    q,
    sort,
    dir,
    get: (key) => {
      const v = first(sp[key]);
      return v && v.trim() !== "" ? v : undefined;
    },
    getAll: (key) => {
      const v = sp[key];
      return (Array.isArray(v) ? v : v ? v.split(",") : []).filter(Boolean);
    },
  };
}

export function buildHref(pathname: string, sp: SearchParams, patch: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else params.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `${pathname}?${s}` : pathname;
}

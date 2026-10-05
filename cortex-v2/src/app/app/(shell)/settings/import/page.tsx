import { CsvImporter } from "@/features/import/components/csv-importer";
import { IMPORT_FIELDS, type ImportEntity } from "@/features/import/schemas";
import { first, type SearchParams } from "@/lib/list-params";
import { requireCtx } from "@/server/auth/context";

export const metadata = { title: "Importar dados" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireCtx("data.import");
  const sp = await searchParams;
  const e = first(sp.entity);
  const entity = e && e in IMPORT_FIELDS ? (e as ImportEntity) : undefined;
  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold">Importar CSV</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">Envie o arquivo, mapeie as colunas, valide e revise a prévia. Duplicidades são sinalizadas e nunca mescladas automaticamente.</p>
      <CsvImporter entity={entity} />
    </div>
  );
}

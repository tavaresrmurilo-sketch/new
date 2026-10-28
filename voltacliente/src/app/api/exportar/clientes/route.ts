import { exportCustomersCsv } from "@/modules/customers/service";
import { getTenant } from "@/server/session";

export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return new Response("Não autorizado", { status: 401 });
  const csv = await exportCustomersCsv(tenant);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clientes-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

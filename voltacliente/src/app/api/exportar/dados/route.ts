import { exportCompanyData } from "@/modules/privacy/service";
import { AppError } from "@/server/errors";
import { getTenant } from "@/server/session";

export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return new Response("Não autorizado", { status: 401 });
  try {
    const data = await exportCompanyData(tenant);
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="voltacliente-dados-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN") return new Response(error.message, { status: 403 });
    throw error;
  }
}

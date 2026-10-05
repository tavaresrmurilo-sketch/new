import { NextResponse, type NextRequest } from "next/server";
import { getCtx } from "@/server/auth/context";
import { ALL_SEARCH_TYPES, searchRecords, type SearchType } from "@/server/modules/search";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const typesParam = req.nextUrl.searchParams.get("types");
  const types = typesParam
    ? (typesParam.split(",").filter((t) => (ALL_SEARCH_TYPES as string[]).includes(t)) as SearchType[])
    : ALL_SEARCH_TYPES;
  const limit = Math.min(10, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 5));
  const results = await searchRecords(ctx, q, types, limit);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}

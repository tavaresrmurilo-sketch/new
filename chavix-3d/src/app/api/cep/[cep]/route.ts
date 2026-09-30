import { NextResponse, type NextRequest } from "next/server";
import { lookupCep } from "@/lib/cep";
import { clientIpFrom } from "@/lib/security/request";
import { rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ cep: string }> }) {
  const { cep } = await params;
  const limit = await rateLimit(`cep:${clientIpFrom(request.headers)}`, 40, 600);
  if (!limit.allowed) return NextResponse.json({ error: "Muitas consultas. Aguarde um pouco." }, { status: 429 });
  try {
    const result = await lookupCep(cep);
    if (!result) return NextResponse.json({ error: "CEP não encontrado" }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "Não conseguimos consultar o CEP agora. Preencha o endereço manualmente." }, { status: 503 });
  }
}

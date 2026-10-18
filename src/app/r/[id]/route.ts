import { recordTicketClick } from "@/server/engagement/tracking";
import { requestMetaFrom } from "@/server/request";

export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9]{1,64}$/i;

const NOT_FOUND_HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Link indisponível · Mixtour</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08080d;color:#f3f3f8;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:center;padding:24px">
<main style="max-width:420px"><p style="color:#ff4d8d;font-weight:700;letter-spacing:.12em;font-size:13px">LINK INDISPONÍVEL</p>
<h1 style="font-size:26px;margin:8px 0 12px">Não encontramos este link de ingressos</h1>
<p style="color:#a3a3b8;line-height:1.6">O evento pode ter sido removido ou o organizador ainda não publicou onde comprar.</p>
<p style="margin-top:28px"><a href="/" style="display:inline-block;padding:14px 24px;border-radius:999px;background:linear-gradient(120deg,#7c5cff,#ff4d8d 72%,#ff8a3d);color:#fff;font-weight:700;text-decoration:none">Explorar eventos</a></p></main></body></html>`;

/**
 * Redirecionamento rastreado para o link de ingressos: só eventos com página
 * pública e URL http(s). O clique é contado (sem inflar por repetição) e o
 * destino recebe apenas a origem como referência.
 */
export async function GET(req: Request, ctx: RouteContext<"/r/[id]">) {
  const { id } = await ctx.params;
  const result = ID_RE.test(id) ? await recordTicketClick(id, requestMetaFrom(req)) : null;
  if (!result) {
    return new Response(NOT_FOUND_HTML, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: result.url,
      "Referrer-Policy": "strict-origin",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

import { calendarEventById } from "@/server/events/detail";
import { requestMetaFrom } from "@/server/request";
import { ipHash } from "@/server/security/crypto";
import { rateLimit, retryMessage } from "@/server/security/rate-limit";
import { buildIcs, icsFilename } from "@/lib/ics";

export const dynamic = "force-dynamic";

/** Arquivo .ics (Apple Agenda, Outlook, Google Agenda…) de um evento com página pública. */
export async function GET(req: Request, ctx: RouteContext<"/api/events/[id]/ics">) {
  const meta = requestMetaFrom(req);
  const rl = await rateLimit("publicApi", `ics:${ipHash(meta.ip) ?? "unknown"}`);
  if (!rl.allowed) {
    return new Response(retryMessage(rl.retryAfterSeconds), {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const { id } = await ctx.params;
  const found = await calendarEventById(id);
  if (!found) return new Response("Evento não encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  return new Response(buildIcs(found.input), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(found.slug)}"`,
      "Cache-Control": "private, no-cache",
      "X-Robots-Tag": "noindex",
    },
  });
}

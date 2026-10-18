import { NextResponse } from "next/server";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** iOS Universal Links: links de eventos, organizadores e convites abrem direto no app. */
export function GET() {
  const e = env();
  if (!e.APPLE_TEAM_ID || !e.IOS_BUNDLE_ID) return NextResponse.json({}, { status: 404 });
  const appID = `${e.APPLE_TEAM_ID}.${e.IOS_BUNDLE_ID}`;
  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [appID],
            components: [{ "/": "/evento/*" }, { "/": "/organizador/*" }, { "/": "/convite/*" }, { "/": "/salvos" }, { "/": "/notificacoes" }],
          },
        ],
      },
      webcredentials: { apps: [appID] },
    },
    { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" } },
  );
}

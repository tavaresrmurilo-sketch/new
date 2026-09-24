import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { apiRoute } from "@/server/auth/guard";
import { destroySession, getAuth } from "@/server/auth/session";

export const POST = apiRoute(async () => {
  const auth = await getAuth();
  if (auth) await audit(auth, { action: "auth.logout", resource: "session" });
  await destroySession();
  return NextResponse.json({ ok: true });
});

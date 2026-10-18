import { NextResponse } from "next/server";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/** Android App Links: autoriza o app a abrir links do Mixtour (ANDROID_APP_ID + impressões SHA-256 do certificado). */
export function GET() {
  const e = env();
  const fingerprints = (e.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  if (!e.ANDROID_APP_ID || !fingerprints.length) return NextResponse.json([], { status: 404 });
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: e.ANDROID_APP_ID, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}

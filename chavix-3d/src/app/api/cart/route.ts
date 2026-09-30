import { NextResponse } from "next/server";
import { buildCartView, getCurrentCart } from "@/lib/cart/service";
import { getStoreSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const [cart, settings] = await Promise.all([getCurrentCart(), getStoreSettings()]);
  const view = await buildCartView(cart, settings);
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

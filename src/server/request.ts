import { headers } from "next/headers";

export interface RequestInfo {
  ip: string | null;
  userAgent: string | null;
}

export async function requestInfo(): Promise<RequestInfo> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

import { requirePage } from "@/server/auth/guard";
import { providerStatus } from "@/server/ai/providers";
import { prisma } from "@/lib/db";
import { ChatClient } from "./chat-client";

export const metadata = { title: "Pergunte ao Cortex" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePage("chat:use");
  const params = await searchParams;
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: ctx.tenantId }, select: { aiProviderConsent: true } });
  const status = providerStatus();
  const engine = tenant.aiProviderConsent && status.active !== "rules" ? `${status.active}${status.model ? ` · ${status.model}` : ""}` : "Motor Cortex (determinístico)";
  return <ChatClient initialQuestion={params.q ?? null} engine={engine} />;
}

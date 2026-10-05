import { PageHeader } from "@/components/common/page-header";
import { requireCtx } from "@/server/auth/context";

export default async function DashboardPage() {
  const ctx = await requireCtx();
  return <PageHeader title={`Olá, ${ctx.user.name}`} description="Dashboard em construção." />;
}

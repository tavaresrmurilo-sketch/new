import { redirect } from "next/navigation";
import { ConnectWizard, type FieldDefLite, type Kind } from "@/components/integrations/connect-wizard";
import { PageHeader } from "@/components/ui/misc";
import { requirePage } from "@/server/auth/guard";
import { TARGET_FIELDS, TARGET_LABELS } from "@/server/cortex/mapping";

export const metadata = { title: "Nova integração" };

const KINDS: Kind[] = ["postgresql", "mysql", "sqlserver", "rest-api"];

export default async function NewIntegrationPage({ searchParams }: { searchParams: Promise<{ fonte?: string }> }) {
  const ctx = await requirePage("integrations:view");
  if (!ctx.permissions.has("integrations:manage")) redirect("/integracoes");
  const { fonte } = await searchParams;
  const fields: Record<string, FieldDefLite[]> = Object.fromEntries(
    Object.entries(TARGET_FIELDS).map(([k, list]) => [k, list.map((f) => ({ key: f.key, label: f.label, required: f.required, kind: f.kind }))]),
  );
  return (
    <>
      <PageHeader title="Nova integração" description="Conecte seu ERP, banco de dados ou API em 7 etapas. Acesso somente leitura." />
      <ConnectWizard fields={fields} entityLabels={TARGET_LABELS} initialKind={KINDS.includes(fonte as Kind) ? (fonte as Kind) : undefined} />
    </>
  );
}

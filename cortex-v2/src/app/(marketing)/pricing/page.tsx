import Link from "next/link";
import { prisma } from "@/lib/db";
import { FEATURES, LIMITS, type FeatureKey } from "@/lib/features";
import { formatCurrency } from "@/lib/format";

export const metadata = { title: "Planos e preços — JR Córtex", description: "Planos do JR Córtex para empresas de serviços B2B." };
export const dynamic = "force-dynamic";

/** Planos lidos do banco (editáveis no painel Super Admin). */
export default async function PricingPage() {
  const plans = await prisma.plan.findMany({ where: { isActive: true, isPublic: true }, orderBy: { sortOrder: "asc" } });
  const limitRows: [string, (p: (typeof plans)[number]) => number | null][] = [
    [LIMITS.users.label, (p) => p.maxUsers],
    [LIMITS.storage_mb.label, (p) => p.maxStorageMb],
    [LIMITS.automations.label, (p) => p.maxAutomations],
    [LIMITS.ai_requests.label, (p) => p.maxAiRequestsMonth],
    [LIMITS.api_keys.label, (p) => p.maxApiKeys],
    [LIMITS.webhooks.label, (p) => p.maxWebhooks],
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-center text-4xl font-semibold tracking-tight">Planos e preços</h1>
      <p className="mt-3 text-center text-muted-foreground">Comece com o período de teste gratuito. Mude de plano quando quiser.</p>
      {plans.length ? (
        <>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div key={p.id} className="flex flex-col rounded-xl border bg-card p-6">
                <p className="text-lg font-semibold">{p.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                <p className="mt-4 text-3xl font-semibold">{p.priceMonthlyCents === null ? "Sob consulta" : <>{formatCurrency(p.priceMonthlyCents / 100, p.currency)}<span className="text-sm font-normal text-muted-foreground">/mês</span></>}</p>
                {p.priceYearlyCents ? <p className="text-xs text-muted-foreground">ou {formatCurrency(p.priceYearlyCents / 100, p.currency)}/ano</p> : null}
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">{p.highlights.map((h) => <li key={h}>✓ {h}</li>)}</ul>
                <Link href={p.priceMonthlyCents === null ? "mailto:contato@jrcortex.com.br" : "/register"} className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90">{p.priceMonthlyCents === null ? "Falar com vendas" : `Testar ${p.trialDays} dias grátis`}</Link>
              </div>
            ))}
          </div>
          <div className="mt-12 overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-subtle"><tr><th className="px-4 py-2 text-left">Recurso</th>{plans.map((p) => <th key={p.id} className="px-4 py-2">{p.name}</th>)}</tr></thead>
              <tbody>
                {limitRows.map(([label, fn]) => <tr key={label} className="border-t"><td className="px-4 py-2">{label}</td>{plans.map((p) => <td key={p.id} className="px-4 py-2 text-center">{fn(p) === null ? "Ilimitado" : fn(p) === 0 ? "—" : fn(p)}</td>)}</tr>)}
                {(Object.keys(FEATURES) as FeatureKey[]).map((f) => <tr key={f} className="border-t"><td className="px-4 py-2">{FEATURES[f]}</td>{plans.map((p) => <td key={p.id} className="px-4 py-2 text-center">{p.features.includes(f) ? "✓" : "—"}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-10 text-center text-muted-foreground">Os planos ainda não foram configurados nesta instalação.</p>
      )}
    </div>
  );
}

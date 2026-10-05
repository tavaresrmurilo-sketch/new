import { Badge } from "@/components/ui/badge";
import { NewApiKeyButton, RevokeApiKeyButton, WebhookButton, WebhookRowActions } from "@/features/integrations/components/integrations-ui";
import { WEBHOOK_EVENTS } from "@/lib/automation-catalog";
import { appUrl } from "@/lib/env";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { requireCtx } from "@/server/auth/context";
import { hasFeature } from "@/server/billing/feature-gate";
import { API_SCOPES } from "@/server/modules/integrations";

export const metadata = { title: "Integrações e API" };

const FUTURE = [
  ["Google Calendar / Outlook", "Sincronização de reuniões"],
  ["Gmail / Outlook", "Registro de e-mails na timeline"],
  ["WhatsApp Business", "Registro de conversas (nunca envio automático)"],
  ["ERP / NF-e", "Emissão e conciliação fiscal"],
  ["Assinatura eletrônica", "Envio de contratos para assinatura"],
  ["Zapier / Make", "Conecte via webhooks e API pública já disponíveis"],
];

export default async function IntegrationsPage() {
  const ctx = await requireCtx("integrations.manage");
  const api = hasFeature(ctx, "api_access");
  const hooksOn = hasFeature(ctx, "webhooks");
  const writable = ctx.access.level === "FULL";
  const [keys, hooks] = await Promise.all([
    ctx.db.apiKey.findMany({ orderBy: { createdAt: "desc" } }),
    ctx.db.webhook.findMany({ orderBy: { createdAt: "desc" }, include: { deliveries: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, event: true, status: true, responseStatus: true, attempts: true, createdAt: true, error: true } } } }),
  ]);
  return (
    <>
      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">API pública (v1)</h2>
            <p className="text-[13px] text-muted-foreground">Autentique com <code className="rounded bg-muted px-1">Authorization: Bearer &lt;chave&gt;</code>. Base: <code className="rounded bg-muted px-1">{appUrl()}/api/v1</code> — endpoints: clients, leads, opportunities, projects, tasks.</p>
            {!api ? <p className="mt-1 text-xs text-warning">A API pública não está incluída no seu plano.</p> : null}
          </div>
          {writable ? <NewApiKeyButton scopes={API_SCOPES} disabled={!api} /> : null}
        </div>
        {keys.length ? (
          <ul className="divide-y rounded-md border text-sm">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{k.name} <code className="ml-1 text-xs text-muted-foreground">{k.prefix}…</code></p>
                  <p className="text-xs text-muted-foreground">{k.scopes.join(", ")} · criada {formatDateTime(k.createdAt, ctx.org.timezone)} · {k.lastUsedAt ? `último uso ${formatRelativeTime(k.lastUsedAt)}` : "nunca usada"}{k.expiresAt ? ` · expira ${formatDateTime(k.expiresAt, ctx.org.timezone)}` : ""}</p>
                </div>
                {k.revokedAt ? <Badge tone="danger">Revogada</Badge> : writable ? <RevokeApiKeyButton id={k.id} name={k.name} /> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted-foreground">Nenhuma API key criada.</p>}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Webhooks</h2>
            <p className="text-[13px] text-muted-foreground">Receba eventos via POST assinado com HMAC-SHA256 (<code className="rounded bg-muted px-1">X-Cortex-Signature: t=…,v1=…</code>, sobre <code>t.corpo</code>). Falhas são reenviadas com backoff (até 6 tentativas).</p>
            {!hooksOn ? <p className="mt-1 text-xs text-warning">Webhooks não estão incluídos no seu plano.</p> : null}
          </div>
          {writable ? <WebhookButton events={WEBHOOK_EVENTS} disabled={!hooksOn} /> : null}
        </div>
        {hooks.length ? (
          <ul className="space-y-3">
            {hooks.map((h) => (
              <li key={h.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm font-medium">{h.name} <span className="text-xs font-normal text-muted-foreground">{h.url}</span></p>
                  {h.enabled ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}
                  {h.consecutiveFailures ? <Badge tone="warning">{h.consecutiveFailures} falha(s) seguidas</Badge> : null}
                  {writable ? <><WebhookButton events={WEBHOOK_EVENTS} initial={{ id: h.id, name: h.name, url: h.url, events: h.events, enabled: h.enabled }} /><WebhookRowActions id={h.id} name={h.name} /></> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Eventos: {h.events.join(", ")}</p>
                {h.deliveries.length ? (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {h.deliveries.map((d) => <li key={d.id} className="text-muted-foreground"><span className={d.status === "SUCCESS" ? "text-success" : d.status === "FAILED" ? "text-destructive" : ""}>{d.status}</span> · {d.event} · HTTP {d.responseStatus ?? "—"} · {d.attempts} tentativa(s) · {formatDateTime(d.createdAt, ctx.org.timezone)}{d.error ? ` · ${d.error}` : ""}</li>)}
                  </ul>
                ) : <p className="mt-2 text-xs text-muted-foreground">Nenhuma entrega ainda.</p>}
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-muted-foreground">Nenhum webhook configurado.</p>}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Outras integrações</h2>
        <p className="mb-3 text-[13px] text-muted-foreground">Ainda não disponíveis. Nenhuma delas está simulada no sistema.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {FUTURE.map(([n, d]) => <li key={n} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-[13px]"><span><b>{n}</b> <span className="text-muted-foreground">— {d}</span></span><Badge>Integração futura</Badge></li>)}
        </ul>
      </section>
    </>
  );
}

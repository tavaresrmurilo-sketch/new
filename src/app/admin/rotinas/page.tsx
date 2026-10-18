import { Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RunJobButton } from "@/components/admin/actions";
import { JOB_STATUS } from "@/components/admin/labels";
import { AdminPage, LinkTabs, Pagination, Panel, StatusBadge } from "@/components/admin/ui";
import { Alert, Badge, EmptyState } from "@/components/ui/misc";
import { listJobRuns } from "@/server/admin/ops";
import { enumParam, pageParam } from "@/server/admin/params";
import { requireAdmin } from "@/server/auth/guards";
import { integrations } from "@/server/env";
import { effectiveJobStatus, JOB_INFO, JOB_NAMES } from "@/server/jobs/catalog";
import { formatDateTime, formatNumber, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Rotinas" };

const RESULT_LABEL: Record<string, string> = {
  events: "eventos",
  sent: "lembretes enviados",
  failed: "falhas",
  archivedEvents: "eventos arquivados",
  expiredSessions: "sessões vencidas",
  oldTokens: "tokens antigos",
  viewMarks: "marcas de visualização",
  rateLimitBuckets: "contadores de limite",
  geocodeCache: "cache de endereços",
  expiredInvites: "convites expirados",
};

interface Detail {
  trigger?: string;
  durationMs?: number;
  result?: Record<string, Record<string, number>>;
  errors?: Record<string, string>;
}

function summary(detail: Detail): string[] {
  const out: string[] = [];
  for (const [step, values] of Object.entries(detail.result ?? {})) {
    if (!values || typeof values !== "object") continue;
    const parts = Object.entries(values)
      .filter(([k, v]) => typeof v === "number" && v > 0 && k !== "windowHours")
      .map(([k, v]) => `${formatNumber(v)} ${RESULT_LABEL[k] ?? k}`);
    out.push(`${step === "reminders" ? "Lembretes" : "Manutenção"}: ${parts.length ? parts.join(", ") : "nada a fazer"}`);
  }
  return out;
}

const TRIGGER: Record<string, string> = { cron: "Agendada", manual: "Manual", cli: "Linha de comando" };

export default async function JobsPage({ searchParams }: PageProps<"/admin/rotinas">) {
  await requireAdmin();
  const sp = await searchParams;
  const job = enumParam(sp, "rotina", JOB_NAMES);
  const data = await listJobRuns(job, pageParam(sp));
  const cronOn = integrations().cron;
  const now = new Date();

  return (
    <AdminPage title="Rotinas" description="Tarefas automáticas da plataforma. Cada execução fica registrada com o resultado e a duração.">
      {!cronOn && (
        <Alert tone="warning" title="Agendamento desativado" className="mb-4">
          Defina <span className="font-mono">CRON_SECRET</span> para que a Vercel Cron (ou outro agendador) execute as rotinas. Enquanto isso, rode manualmente por aqui ou com{" "}
          <span className="font-mono">npm run jobs:run -- daily</span>.
        </Alert>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {JOB_NAMES.map((name) => {
          const last = data.latest[name];
          const status = last ? effectiveJobStatus(last, now) : null;
          return (
            <Panel key={name} title={JOB_INFO[name].label} description={JOB_INFO[name].schedule} className="flex flex-col" bodyClassName="flex flex-1 flex-col gap-4 pt-3">
              <p className="text-[13px] leading-snug text-muted-foreground">{JOB_INFO[name].description}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm">
                  {last && status ? (
                    <>
                      <StatusBadge map={JOB_STATUS} value={status} />
                      <span className="text-muted-foreground" title={formatDateTime(last.startedAt)}>
                        {timeAgo(last.startedAt, now)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Nunca executada</span>
                  )}
                </p>
                <RunJobButton job={name} label={JOB_INFO[name].label} />
              </div>
            </Panel>
          );
        })}
      </div>

      <h2 className="mt-8 mb-3 text-lg font-bold tracking-tight">Histórico</h2>
      <LinkTabs
        basePath="/admin/rotinas"
        params={{ rotina: job }}
        name="rotina"
        value={job}
        label="Filtrar por rotina"
        options={[{ value: undefined, label: "Todas" }, ...JOB_NAMES.map((n) => ({ value: n, label: JOB_INFO[n].label }))]}
      />
      {data.items.length === 0 ? (
        <div className="rounded-3xl border border-border bg-surface shadow-card">
          <EmptyState icon={<Timer />} title="Nenhuma execução ainda" description="Use “Executar agora” ou aguarde o próximo agendamento." />
        </div>
      ) : (
        <ol className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          {data.items.map((run) => {
            const detail = (run.detail ?? {}) as Detail;
            const status = effectiveJobStatus(run, now);
            const lines = summary(detail);
            return (
              <li key={run.id} className="flex flex-col gap-2 border-b border-border px-4 py-4 last:border-0 sm:px-5 lg:grid lg:grid-cols-[180px_minmax(0,0.8fr)_minmax(0,2fr)] lg:gap-4">
                <div>
                  <p className="text-sm font-semibold tabular-nums">{formatDateTime(run.startedAt)}</p>
                  <p className="text-xs text-muted-foreground">
                    {TRIGGER[detail.trigger ?? ""] ?? "—"}
                    {detail.durationMs != null && ` · ${detail.durationMs < 1000 ? `${detail.durationMs} ms` : `${(detail.durationMs / 1000).toFixed(1).replace(".", ",")} s`}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="outline">{JOB_INFO[run.job as keyof typeof JOB_INFO]?.label ?? run.job}</Badge>
                  <StatusBadge map={JOB_STATUS} value={status} />
                </div>
                <div className="min-w-0 text-[13px] leading-relaxed">
                  {lines.map((l) => (
                    <p key={l} className="text-muted-foreground">
                      {l}
                    </p>
                  ))}
                  {Object.entries(detail.errors ?? {}).map(([step, msg]) => (
                    <p key={step} className="font-mono text-xs break-words text-danger">
                      {step}: {msg}
                    </p>
                  ))}
                  {!lines.length && !detail.errors && <p className="text-subtle-foreground">{status === "running" ? "Em andamento…" : "Sem detalhes."}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Pagination basePath="/admin/rotinas" params={{ rotina: job }} page={data.page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} noun="execuções" />
      <p className="mt-6 text-[13px] text-muted-foreground">
        Endpoint: <span className="font-mono">GET /api/cron/{"{daily|reminders|maintenance}"}</span> com <span className="font-mono">Authorization: Bearer $CRON_SECRET</span>. Veja{" "}
        <Link href="/admin/configuracoes#integracoes" className="font-semibold text-primary hover:underline">
          integrações
        </Link>
        .
      </p>
    </AdminPage>
  );
}

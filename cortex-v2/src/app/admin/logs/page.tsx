import { PageHeader } from "@/components/common/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { first, type SearchParams } from "@/lib/list-params";

export const metadata = { title: "Logs" };

export default async function AdminLogs({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = first(sp.tab) === "system" ? "system" : first(sp.tab) === "jobs" ? "jobs" : "audit";
  const tz = "America/Sao_Paulo";
  const [audit, events, jobs] = await Promise.all([
    tab === "audit" ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) : [],
    tab === "system" ? prisma.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }) : [],
    tab === "jobs" ? prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 100 }) : [],
  ]);
  return (
    <>
      <PageHeader title="Logs" />
      <div className="flex gap-1 text-xs">{[["audit", "Auditoria"], ["system", "Eventos do sistema"], ["jobs", "Jobs"]].map(([k, l]) => <a key={k} href={`?tab=${k}`} className={`rounded-md border px-2 py-1 ${tab === k ? "bg-accent" : ""}`}>{l}</a>)}</div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        {tab === "audit" ? (
          <Table><THead><TR className="hover:bg-transparent"><TH>Quando</TH><TH>Ação</TH><TH>Quem</TH><TH>Empresa</TH><TH>IP</TH></TR></THead>
            <TBody>{audit.map((r) => <TR key={r.id}><TD className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt, tz)}</TD><TD className="font-mono text-xs">{r.action}</TD><TD className="text-xs">{r.actorEmail ?? "sistema"}{r.impersonatorId ? " (suporte)" : ""}</TD><TD className="text-xs">{r.organizationId ?? "—"}</TD><TD className="text-xs">{r.ip ?? "—"}</TD></TR>)}</TBody></Table>
        ) : tab === "system" ? (
          <Table><THead><TR className="hover:bg-transparent"><TH>Quando</TH><TH>Nível</TH><TH>Origem</TH><TH>Mensagem</TH></TR></THead>
            <TBody>{events.map((r) => <TR key={r.id}><TD className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt, tz)}</TD><TD className={`text-xs ${r.level === "error" ? "text-destructive" : r.level === "warn" ? "text-warning" : ""}`}>{r.level}</TD><TD className="text-xs">{r.source}</TD><TD className="text-xs">{r.message}</TD></TR>)}</TBody></Table>
        ) : (
          <Table><THead><TR className="hover:bg-transparent"><TH>Início</TH><TH>Job</TH><TH>Status</TH><TH>Duração</TH><TH>Resultado</TH></TR></THead>
            <TBody>{jobs.map((r) => <TR key={r.id}><TD className="whitespace-nowrap text-xs">{formatDateTime(r.startedAt, tz)}</TD><TD className="text-xs">{r.job}</TD><TD className={`text-xs ${r.status === "FAILED" ? "text-destructive" : ""}`}>{r.status}</TD><TD className="text-xs">{r.finishedAt ? `${r.finishedAt.getTime() - r.startedAt.getTime()} ms` : "—"}</TD><TD className="max-w-md truncate font-mono text-[11px]">{r.error ?? JSON.stringify(r.result)}</TD></TR>)}</TBody></Table>
        )}
      </div>
    </>
  );
}

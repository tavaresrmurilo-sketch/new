import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin, Users } from "lucide-react";
import { DetailList, PageHeader, Section } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { UserAvatar } from "@/components/common/user-avatar";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { Card, CardContent } from "@/components/ui/card";
import { TranscriptAnalyzer } from "@/features/ai/components/transcript-analyzer";
import { DocumentList } from "@/features/documents/components/document-list";
import { DocumentUploadButton } from "@/features/documents/components/document-upload";
import { MeetingActions } from "@/features/meetings/components/meeting-actions";
import { toLocalDateTimeInput } from "@/lib/dates";
import { formatDateTime, formatTime } from "@/lib/format";
import { MEETING_STATUS } from "@/lib/labels";
import { requireCtx } from "@/server/auth/context";
import { aiAvailability } from "@/server/ai/availability";
import { getMeetingDetail } from "@/server/modules/meetings";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx("meetings.read");
  const { id } = await params;
  const m = await getMeetingDetail(ctx, id);
  if (!m) notFound();
  const tz = ctx.org.timezone;
  const writable = ctx.access.level === "FULL";
  const canWrite = writable && ctx.permissions.has("meetings.write");
  const summary = m.aiSummary as { summary?: string | null; topics?: string[]; decisions?: string[]; confirmedAt?: string } | null;
  const external = m.participants.filter((p) => !p.userId && !p.contactId);
  return (
    <div className="space-y-5">
      <BreadcrumbLabel segment={id} label={m.title} />
      <PageHeader
        eyebrow={<StatusBadge map={MEETING_STATUS} value={m.status} />}
        title={m.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> {formatDateTime(m.startsAt, tz)}{m.endsAt ? ` – ${formatTime(m.endsAt, tz)}` : ""}</span>
            {m.location ? <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {m.location}</span> : null}
          </span>
        }
        actions={
          <MeetingActions
            id={id}
            status={m.status}
            clientLabel={m.client?.name ?? null}
            canWrite={canWrite}
            canDelete={writable && ctx.permissions.has("meetings.delete")}
            values={{
              title: m.title,
              clientId: m.clientId,
              opportunityId: m.opportunityId,
              projectId: m.projectId,
              startsAt: toLocalDateTimeInput(m.startsAt, tz),
              endsAt: toLocalDateTimeInput(m.endsAt, tz),
              location: m.location,
              description: m.description,
              participantUserIds: m.participants.filter((p) => p.userId).map((p) => p.userId!),
              participantContactIds: m.participants.filter((p) => p.contactId).map((p) => p.contactId!),
              externalParticipants: external.map((p) => p.email ?? p.name).filter(Boolean).join(", "),
              status: m.status,
              minutes: m.minutes,
              decisions: m.decisions,
              nextActions: m.nextActions,
            }}
          />
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {m.description ? <Section title="Pauta"><p className="whitespace-pre-line text-sm text-muted-foreground">{m.description}</p></Section> : null}
          {summary?.summary ? (
            <Section title="Resumo confirmado" description={summary.confirmedAt ? `Gerado com o Córtex AI e confirmado em ${formatDateTime(summary.confirmedAt, tz)}` : undefined}>
              <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
                <p className="whitespace-pre-line">{summary.summary}</p>
                {summary.topics?.length ? <p className="text-muted-foreground"><span className="font-medium text-foreground">Assuntos:</span> {summary.topics.join(" · ")}</p> : null}
              </div>
            </Section>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardContent className="pt-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ata</p><p className="whitespace-pre-line text-sm">{m.minutes ?? "—"}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Decisões</p><p className="whitespace-pre-line text-sm">{m.decisions ?? "—"}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Próximas ações</p><p className="whitespace-pre-line text-sm">{m.nextActions ?? "—"}</p></CardContent></Card>
          </div>
          <Section title="Transcrição e Córtex AI" description="Cole a transcrição após a reunião. O Córtex sugere resumo, decisões, tarefas, responsáveis e prazos — você confirma antes de qualquer tarefa ser criada.">
            <TranscriptAnalyzer meetingId={id} initialTranscript={m.transcript} availability={await aiAvailability(ctx)} canWrite={canWrite} />
          </Section>
          <Section title="Documentos" actions={writable && ctx.permissions.has("documents.write") ? <DocumentUploadButton defaults={{ meetingId: id, clientId: m.clientId ?? undefined }} /> : null}>
            <DocumentList documents={m.documents} tz={tz} canDelete={writable && ctx.permissions.has("documents.delete")} />
          </Section>
        </div>
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-2 pt-4">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Users className="size-3.5" /> Participantes</p>
              <ul className="space-y-2">
                {m.participants.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm">
                    <UserAvatar name={p.user?.name ?? p.contact?.name ?? p.name ?? p.email} size="sm" />
                    <span className="min-w-0 truncate">
                      {p.user?.name ?? p.contact?.name ?? p.name ?? p.email}
                      <span className="block text-xs text-muted-foreground">{p.user ? "Equipe" : p.contact ? (p.contact.jobTitle ?? "Contato do cliente") : "Externo"}</span>
                    </span>
                  </li>
                ))}
                {!m.participants.length ? <li className="text-sm text-muted-foreground">Nenhum participante.</li> : null}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <DetailList
                className="sm:grid-cols-1"
                items={[
                  { label: "Cliente", value: m.client ? <Link href={`/app/clients/${m.client.id}`} className="hover:underline">{m.client.name}</Link> : "—" },
                  { label: "Oportunidade", value: m.opportunity ? <Link href={`/app/opportunities/${m.opportunity.id}`} className="hover:underline">{m.opportunity.title}</Link> : "—" },
                  { label: "Projeto", value: m.project ? <Link href={`/app/projects/${m.project.id}`} className="hover:underline">{m.project.name}</Link> : "—" },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

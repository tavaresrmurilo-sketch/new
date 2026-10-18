import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResendEmailButton } from "@/components/admin/actions";
import { EMAIL_STATUS } from "@/components/admin/labels";
import { AdminPage, Meta, Panel, StatusBadge } from "@/components/admin/ui";
import { Alert } from "@/components/ui/misc";
import { getEmail } from "@/server/admin/ops";
import { requireAdmin } from "@/server/auth/guards";
import { integrations } from "@/server/env";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "E-mail" };

export default async function EmailDetailPage({ params }: PageProps<"/admin/emails/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const m = await getEmail(id);
  if (!m) notFound();
  const canResend = m.status === "FAILED" || m.status === "SKIPPED";
  const emailOn = integrations().email;

  return (
    <AdminPage
      eyebrow={
        <Link href="/admin/emails" className="inline-flex min-h-8 items-center gap-1 hover:underline">
          <ArrowLeft className="size-4" /> E-mails
        </Link>
      }
      title={<span className="line-clamp-2 break-words">{m.subject}</span>}
      description={<span className="break-all">Para {m.to}</span>}
      actions={canResend ? <ResendEmailButton id={m.id} disabledReason={emailOn ? null : "Configure um provedor de e-mail para reenviar."} /> : undefined}
    >
      {m.status === "FAILED" && m.error && (
        <Alert tone="danger" title="O provedor recusou o envio" className="mb-3">
          <span className="font-mono text-xs break-words">{m.error}</span>
        </Alert>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Conteúdo" description="Prévia isolada (sem scripts nem acesso à página)." bodyClassName="p-3 sm:p-4">
          <iframe
            title={`Prévia do e-mail: ${m.subject}`}
            sandbox=""
            srcDoc={m.html}
            referrerPolicy="no-referrer"
            loading="lazy"
            className="h-[460px] w-full rounded-2xl border border-border bg-white lg:h-[640px]"
          />
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Detalhes">
            <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
              <Meta label="Status">
                <StatusBadge map={EMAIL_STATUS} value={m.status} />
              </Meta>
              <Meta label="Modelo">
                <span className="font-mono text-xs">{m.template}</span>
              </Meta>
              <Meta label="Criado em">{formatDateTime(m.createdAt)}</Meta>
              <Meta label="Enviado em">{m.sentAt ? formatDateTime(m.sentAt) : "—"}</Meta>
              <Meta label="Provedor">{m.provider ?? "—"}</Meta>
              <Meta label="Tentativas">{formatNumber(m.attempts)}</Meta>
              {m.providerMessageId && (
                <Meta label="ID no provedor" className="col-span-2 lg:col-span-1">
                  <span className="font-mono text-xs">{m.providerMessageId}</span>
                </Meta>
              )}
            </dl>
            {canResend && <p className="mt-4 text-[13px] leading-snug text-muted-foreground">O reenvio cria um novo registro no outbox; este fica como histórico.</p>}
          </Panel>
          <Panel title="Versão em texto">
            <pre className="max-h-72 overflow-auto rounded-2xl bg-surface-2/70 p-3 font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap">{m.text}</pre>
          </Panel>
        </div>
      </div>
    </AdminPage>
  );
}

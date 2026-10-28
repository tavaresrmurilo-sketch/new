import type { Metadata } from "next";
import Link from "next/link";
import {
  BanIcon,
  BellRingIcon,
  CalendarIcon,
  CalendarPlusIcon,
  HistoryIcon,
  MailIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  StickyNoteIcon,
} from "lucide-react";
import { EmptyState } from "@/components/app/empty-state";
import { ConsentBadge } from "@/components/app/status-badges";
import { DeleteCustomerButton, RecordConsentButton } from "@/components/customers/customer-actions";
import { ReminderStatusBadge } from "@/components/returns/reminder-status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONTACT_PREFERENCE_LABEL } from "@/lib/contact-policy";
import { formatDate, formatDateShort, fromDbDate, todayIn } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { CHANNEL_LABEL, OUTCOME_LABEL } from "@/modules/returns/schema";
import { getCustomer } from "@/modules/customers/service";
import { orNotFound } from "@/server/errors";
import { requireTenantPage } from "@/server/session";

export const metadata: Metadata = { title: "Cliente" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function InfoRow({ icon: Icon, label, children }: { icon: typeof PhoneIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm break-words">{children}</div>
      </div>
    </div>
  );
}

export default async function CustomerPage({ params }: PageProps<"/clientes/[id]">) {
  const tenant = await requireTenantPage();
  const { id } = await params;
  const customer = await orNotFound(getCustomer(tenant, id));
  const today = todayIn(tenant.timezone);
  const formatTime = (d: Date) => dateTime.format(d).replace(",", "");
  const openReminder = customer.reminders.find((r) => r.status === "PENDING" || r.status === "CONTACTED");
  const totalCents = customer.appointments.reduce((sum, a) => sum + (a.amountCents ?? 0), 0);

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={customer.name} className="size-14 text-base" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{customer.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ConsentBadge consent={customer.marketingConsent} doNotContact={customer.doNotContact} />
              <Badge variant="outline">Prefere {CONTACT_PREFERENCE_LABEL[customer.contactPreference].toLowerCase()}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/atendimentos/novo?cliente=${customer.id}`}>
              <CalendarPlusIcon /> Registrar atendimento
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/clientes/${customer.id}/editar`}>
              <PencilIcon /> Editar
            </Link>
          </Button>
          <DeleteCustomerButton id={customer.id} name={customer.name} />
        </div>
      </div>

      {openReminder && (
        <Card className="flex-row items-center gap-4 border-emerald/30 bg-emerald-soft/40 px-5 py-4">
          <BellRingIcon className="size-5 shrink-0 text-emerald" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              Retorno de {openReminder.service.name} previsto para {formatDate(fromDbDate(openReminder.remindAt))}
            </p>
            <p className="text-muted-foreground">
              {openReminder.status === "CONTACTED" ? "Contato já registrado, aguardando o cliente." : "Aguardando contato."}
            </p>
          </div>
          <Button asChild size="sm" variant="emerald">
            <Link
              href={`/retornos?q=${encodeURIComponent(customer.name)}&aba=${openReminder.status === "CONTACTED" ? "contatados" : fromDbDate(openReminder.remindAt) < today ? "atrasados" : fromDbDate(openReminder.remindAt) === today ? "hoje" : "proximos"}`}
            >
              Abrir na central
            </Link>
          </Button>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow icon={PhoneIcon} label="Telefone / WhatsApp">
              <span className="tabular-nums">{formatPhone(customer.phoneNormalized)}</span>
            </InfoRow>
            <InfoRow icon={MailIcon} label="E-mail">
              {customer.email ?? <span className="text-muted-foreground">Não informado</span>}
            </InfoRow>
            <InfoRow icon={CalendarIcon} label="Cliente desde">
              {formatDate(fromDbDate(customer.registeredAt))}
            </InfoRow>
            <InfoRow icon={StickyNoteIcon} label="Observações">
              {customer.notes ? (
                <span className="whitespace-pre-line">{customer.notes}</span>
              ) : (
                <span className="text-muted-foreground">Nenhuma</span>
              )}
            </InfoRow>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              {customer.doNotContact ? (
                <p className="flex items-center gap-1.5 text-destructive">
                  <BanIcon className="size-3.5" /> Pediu para não ser contatado
                  {customer.doNotContactAt ? ` em ${formatTime(customer.doNotContactAt)}` : ""}.
                </p>
              ) : customer.marketingConsent ? (
                <p>Consentimento registrado{customer.consentUpdatedAt ? ` em ${formatTime(customer.consentUpdatedAt)}` : ""}.</p>
              ) : (
                <>
                  <p>Sem consentimento registrado: o envio pelo WhatsApp fica bloqueado.</p>
                  <RecordConsentButton id={customer.id} />
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 border-t pt-4 text-center">
              <div>
                <p className="text-xl font-semibold">{customer.appointments.length}</p>
                <p className="text-xs text-muted-foreground">atendimentos</p>
              </div>
              <div>
                <p className="text-xl font-semibold">{formatBRL(totalCents)}</p>
                <p className="text-xs text-muted-foreground">valor registrado</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="atendimentos">
          <TabsList className="w-full sm:w-fit">
            <TabsTrigger value="atendimentos">Atendimentos</TabsTrigger>
            <TabsTrigger value="retornos">Retornos</TabsTrigger>
            <TabsTrigger value="contatos">Contatos</TabsTrigger>
          </TabsList>

          <TabsContent value="atendimentos">
            {customer.appointments.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="Nenhum atendimento"
                description="Registre o último serviço feito para este cliente — o retorno é calculado automaticamente."
                action={
                  <Button asChild size="sm">
                    <Link href={`/atendimentos/novo?cliente=${customer.id}`}>
                      <CalendarPlusIcon /> Registrar atendimento
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ol className="relative space-y-3 border-l pl-5">
                {customer.appointments.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute top-4 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" />
                    <Card className="gap-1 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{a.service.name}</p>
                        <div className="flex items-center gap-2">
                          {a.returnOfReminderId && <Badge variant="success">Retorno</Badge>}
                          <span className="text-sm tabular-nums">{a.amountCents != null ? formatBRL(a.amountCents) : "—"}</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(fromDbDate(a.date))}
                        {a.nextReturnDate
                          ? ` · próximo retorno sugerido: ${formatDate(fromDbDate(a.nextReturnDate))}`
                          : " · sem retorno programado"}
                      </p>
                      {a.notes && <p className="mt-1 text-sm whitespace-pre-line">{a.notes}</p>}
                      <div className="mt-1">
                        <Link href={`/atendimentos/${a.id}/editar`} className="text-xs font-medium text-primary hover:underline">
                          Editar atendimento
                        </Link>
                      </div>
                    </Card>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>

          <TabsContent value="retornos">
            {customer.reminders.length === 0 ? (
              <EmptyState
                icon={BellRingIcon}
                title="Nenhum retorno programado"
                description="Os retornos são criados ao registrar atendimentos."
              />
            ) : (
              <Card className="py-0">
                <ul className="divide-y">
                  {customer.reminders.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">{r.service.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Recomendado para {formatDateShort(fromDbDate(r.dueDate))}
                          {r.remindAt.getTime() !== r.dueDate.getTime() ? ` · adiado para ${formatDateShort(fromDbDate(r.remindAt))}` : ""}
                          {r.contactCount > 0 ? ` · ${r.contactCount} contato(s)` : ""}
                        </p>
                      </div>
                      <ReminderStatusBadge
                        status={r.status}
                        closedReason={r.closedReason}
                        remindAt={fromDbDate(r.remindAt)}
                        today={today}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="contatos">
            {customer.contactLogs.length === 0 ? (
              <EmptyState
                icon={HistoryIcon}
                title="Nenhum contato registrado"
                description="Os contatos registrados na central de retornos aparecem aqui."
              />
            ) : (
              <Card className="py-0">
                <ul className="divide-y">
                  {customer.contactLogs.map((log) => (
                    <li key={log.id} className="space-y-1 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <MessageCircleIcon className="size-4 text-muted-foreground" />
                          {CHANNEL_LABEL[log.channel]} · {OUTCOME_LABEL[log.outcome]}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(log.createdAt)}
                          {log.user ? ` · ${log.user.name}` : ""}
                        </span>
                      </div>
                      {log.note && <p className="text-sm text-muted-foreground">{log.note}</p>}
                      {log.message && (
                        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs whitespace-pre-line text-muted-foreground">{log.message}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

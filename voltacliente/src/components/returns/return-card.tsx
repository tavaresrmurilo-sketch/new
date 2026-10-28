"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BanIcon,
  CalendarPlusIcon,
  CheckCheckIcon,
  EllipsisVerticalIcon,
  HistoryIcon,
  MailIcon,
  PhoneIcon,
  RotateCcwIcon,
  ShieldQuestionIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { phoneCallDecision, whatsappDecision } from "@/lib/contact-policy";
import { formatDate, formatDateShort, relativeDayLabel } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { telUrl } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { dismissReminderAction, reopenReminderAction } from "@/modules/returns/actions";
import { CHANNEL_LABEL, OUTCOME_LABEL } from "@/modules/returns/schema";
import type { ReturnListItem } from "@/modules/returns/service";
import { ContactDialog } from "./contact-dialog";
import { HistoryDialog } from "./history-dialog";
import { MarkContactedDialog } from "./mark-contacted-dialog";
import { ReminderStatusBadge } from "./reminder-status-badge";
import { SnoozeMenu } from "./snooze-menu";
import { WhatsAppIcon } from "./whatsapp-icon";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="line-clamp-2 text-sm break-words">{children}</dd>
    </div>
  );
}

export function ReturnCard({ item, today }: { item: ReturnListItem; today: string }) {
  const router = useRouter();
  const [contactOpen, setContactOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const open = item.status === "PENDING" || item.status === "CONTACTED";
  const whatsapp = whatsappDecision(item.customer);
  const call = phoneCallDecision(item.customer);
  const overdue = item.status === "PENDING" && item.remindAt < today;

  function reopen() {
    startTransition(async () => {
      const result = await reopenReminderAction(item.id);
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Card className={cn("gap-4 p-4 transition-shadow hover:shadow-md sm:p-5", overdue && "border-l-4 border-l-warning")}>
      <div className="flex items-start gap-3">
        <Avatar name={item.customer.name} className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/clientes/${item.customer.id}`} className="truncate font-semibold hover:underline">
              {item.customer.name}
            </Link>
            <ReminderStatusBadge status={item.status} closedReason={item.closedReason} remindAt={item.remindAt} today={today} />
            {item.customer.doNotContact ? (
              <Badge variant="danger">
                <BanIcon /> Não contatar
              </Badge>
            ) : (
              !item.customer.marketingConsent && (
                <Badge variant="secondary">
                  <ShieldQuestionIcon /> Sem consentimento
                </Badge>
              )
            )}
          </div>
          <p className="text-sm text-muted-foreground tabular-nums">{item.customer.phone}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Mais ações" disabled={pending}>
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
              <HistoryIcon /> Ver histórico
            </DropdownMenuItem>
            {call.allowed && (
              <DropdownMenuItem asChild>
                <a href={telUrl(item.customer.phoneNormalized)}>
                  <PhoneIcon /> Ligar
                </a>
              </DropdownMenuItem>
            )}
            {item.customer.email && !item.customer.doNotContact && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${item.customer.email}`}>
                  <MailIcon /> Enviar e-mail
                </a>
              </DropdownMenuItem>
            )}
            {open && (
              <>
                <DropdownMenuSeparator />
                <ConfirmDialog
                  trigger={
                    <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                      <XCircleIcon /> Encerrar sem retorno
                    </DropdownMenuItem>
                  }
                  title="Encerrar este retorno?"
                  description={<p>O lembrete sai da fila de contatos. Você poderá reabri-lo na aba “Encerrados”.</p>}
                  confirmLabel="Encerrar"
                  onConfirm={async () => {
                    const result = await dismissReminderAction(item.id);
                    if (!result.ok) {
                      toast.error(result.error);
                      return false;
                    }
                    toast.success(result.message);
                    router.refresh();
                  }}
                />
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-4">
        <Detail label="Serviço anterior">{item.service.name}</Detail>
        <Detail label="Último atendimento">{formatDate(item.lastAppointmentDate)}</Detail>
        <Detail label="Data recomendada">
          {formatDate(item.dueDate)}
          {item.snoozed && open && (
            <span className="block text-xs text-muted-foreground">adiado para {formatDateShort(item.remindAt)}</span>
          )}
        </Detail>
        <Detail label={item.status === "CONVERTED" ? "Retorno" : "Contatos"}>
          {item.status === "CONVERTED" && item.conversion ? (
            <>
              {formatDateShort(item.conversion.date)}
              {item.conversion.amountCents != null && (
                <span className="text-muted-foreground"> · {formatBRL(item.conversion.amountCents)}</span>
              )}
            </>
          ) : item.lastContact ? (
            <span title={`${CHANNEL_LABEL[item.lastContact.channel]} · ${OUTCOME_LABEL[item.lastContact.outcome]}`}>
              {item.contactCount}× · último {dateTime.format(new Date(item.lastContact.at)).split(" ")[0]}
            </span>
          ) : (
            <span className="text-muted-foreground">Nenhum</span>
          )}
        </Detail>
      </dl>

      {open && (
        <div className="flex flex-wrap gap-2">
          {whatsapp.allowed ? (
            <Button variant="emerald" size="sm" onClick={() => setContactOpen(true)}>
              <WhatsAppIcon className="size-4" /> Enviar WhatsApp
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setContactOpen(true)}>
                  <WhatsAppIcon className="size-4 opacity-60" /> Enviar WhatsApp
                </Button>
              </TooltipTrigger>
              <TooltipContent>{whatsapp.reason}</TooltipContent>
            </Tooltip>
          )}
          {!item.customer.doNotContact && (
            <Button variant="outline" size="sm" onClick={() => setMarkOpen(true)}>
              <CheckCheckIcon /> Marcar como contatado
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`/atendimentos/novo?retorno=${item.id}`}>
              <CalendarPlusIcon /> Registrar retorno
            </Link>
          </Button>
          <SnoozeMenu reminderId={item.id} today={today} />
          {item.status === "PENDING" && (
            <span className="ml-auto self-center text-xs text-muted-foreground">
              {item.remindAt === today ? "Previsto para hoje" : relativeDayLabel(item.remindAt, today)}
            </span>
          )}
        </div>
      )}
      {item.status === "DISMISSED" && (
        <div>
          <Button variant="outline" size="sm" onClick={reopen} disabled={pending || item.customer.doNotContact}>
            <RotateCcwIcon /> Reabrir
          </Button>
        </div>
      )}

      <ContactDialog reminderId={item.id} open={contactOpen} onOpenChange={setContactOpen} />
      <MarkContactedDialog reminderId={item.id} customerName={item.customer.name} open={markOpen} onOpenChange={setMarkOpen} />
      <HistoryDialog reminderId={item.id} customerName={item.customer.name} open={historyOpen} onOpenChange={setHistoryOpen} />
    </Card>
  );
}

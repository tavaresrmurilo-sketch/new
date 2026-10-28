"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getReminderHistoryAction } from "@/modules/returns/actions";
import { CHANNEL_LABEL, OUTCOME_LABEL } from "@/modules/returns/schema";

type History = Extract<Awaited<ReturnType<typeof getReminderHistoryAction>>, { ok: true }>["data"];

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Lembrete criado",
  WHATSAPP_OPENED: "WhatsApp aberto",
  CONTACTED: "Contato registrado",
  SNOOZED: "Adiado",
  CONVERTED: "Cliente retornou",
  DISMISSED: "Encerrado",
  REOPENED: "Reaberto",
  RESCHEDULED: "Data alterada",
  SUPERSEDED: "Substituído",
};

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function HistoryDialog({
  reminderId,
  customerName,
  open,
  onOpenChange,
}: {
  reminderId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Histórico do retorno</DialogTitle>
          <DialogDescription>{customerName}</DialogDescription>
        </DialogHeader>
        {open && <HistoryBody reminderId={reminderId} />}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ reminderId }: { reminderId: string }) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReminderHistoryAction(reminderId).then((r) => (r.ok ? setHistory(r.data) : setError(r.error)));
  }, [reminderId]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!history) return <Skeleton className="h-40" />;
  return (
    <ol className="max-h-[60vh] space-y-3 overflow-auto border-l pl-4">
      {history.events.map((e) => (
        <li key={e.id} className="relative text-sm">
          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-primary" />
          <p className="font-medium">{EVENT_LABEL[e.type] ?? e.type}</p>
          {e.note && <p className="text-muted-foreground">{e.note}</p>}
          <p className="text-xs text-muted-foreground">
            {dateTime.format(new Date(e.createdAt))}
            {e.userName ? ` · ${e.userName}` : ""}
          </p>
        </li>
      ))}
      {history.contacts.length > 0 && (
        <li className="pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contatos registrados</li>
      )}
      {history.contacts.map((c) => (
        <li key={c.id} className="relative text-sm">
          <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-emerald" />
          <p className="font-medium">
            {CHANNEL_LABEL[c.channel]} · {OUTCOME_LABEL[c.outcome]}
          </p>
          {c.note && <p className="text-muted-foreground">{c.note}</p>}
          {c.message && <p className="mt-1 rounded-lg bg-muted px-2 py-1 text-xs whitespace-pre-line text-muted-foreground">{c.message}</p>}
          <p className="text-xs text-muted-foreground">{dateTime.format(new Date(c.createdAt))}</p>
        </li>
      ))}
    </ol>
  );
}

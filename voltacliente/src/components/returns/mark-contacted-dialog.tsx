"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { markContactedAction } from "@/modules/returns/actions";
import { CHANNEL_LABEL, CONTACT_CHANNELS, CONTACT_OUTCOMES, OUTCOME_LABEL } from "@/modules/returns/schema";

type Channel = (typeof CONTACT_CHANNELS)[number];
type Outcome = (typeof CONTACT_OUTCOMES)[number];

export function MarkContactedDialog({
  reminderId,
  customerName,
  open,
  onOpenChange,
  defaultChannel = "WHATSAPP",
}: {
  reminderId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultChannel?: Channel;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [outcome, setOutcome] = useState<Outcome>("MESSAGE_SENT");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await markContactedAction(reminderId, { channel, outcome, note });
      if (!result.ok) return setError(result.error);
      toast.success(result.message);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar contato</DialogTitle>
          <DialogDescription>Registre o contato feito com {customerName}. Ele entra no histórico e nos indicadores.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Canal" htmlFor="channel">
              <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                <SelectTrigger id="channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Resultado" htmlFor="outcome">
              <Select value={outcome} onValueChange={(v) => setOutcome(v as Outcome)}>
                <SelectTrigger id="outcome">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {OUTCOME_LABEL[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          {(outcome === "DECLINED" || outcome === "OPTED_OUT") && (
            <Alert variant="warning">
              <AlertDescription>
                {outcome === "OPTED_OUT"
                  ? "O retorno será encerrado e o cliente ficará marcado como “não contatar”, bloqueando novos envios."
                  : "O retorno será encerrado sem novo atendimento."}
              </AlertDescription>
            </Alert>
          )}
          <Field label="Observação" htmlFor="note" optional>
            <Textarea id="note" name="note" rows={2} maxLength={500} placeholder="Ex.: pediu para ligar na próxima semana" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancelar
            </Button>
            <SubmitButton pending={pending} pendingLabel="Registrando...">
              Registrar contato
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

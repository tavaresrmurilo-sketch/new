"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect, Textarea } from "@/components/ui/input";
import { CLOSE_REASON, LOSS_REASONS, WIN_REASONS } from "@/lib/labels";

/** Coleta o motivo do ganho/perda (obrigatório) — base do Win/Loss Intelligence. */
export function CloseReasonDialog({
  open,
  kind,
  title,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  kind: "WON" | "LOST";
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string, notes: string) => Promise<void> | void;
}) {
  const reasons = kind === "WON" ? WIN_REASONS : LOSS_REASONS;
  const [reason, setReason] = React.useState<string>(reasons[0]);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setReason(reasons[0]);
      setNotes("");
    }
  }, [open, reasons]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onCancel()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{kind === "WON" ? "Fechado ganho 🎉" : "Fechado perdido"}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cr-reason">{kind === "WON" ? "Principal motivo do ganho" : "Principal motivo da perda"}</Label>
            <NativeSelect id="cr-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {CLOSE_REASON[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-notes">Observações (opcional)</Label>
            <Textarea id="cr-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={kind === "LOST" ? "Ex.: concorrente ofereceu prazo menor" : ""} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason, notes);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

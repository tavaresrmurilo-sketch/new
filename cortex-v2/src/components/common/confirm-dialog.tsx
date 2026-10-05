"use client";

import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "@/components/ui/button";

/** Confirmação obrigatória para operações destrutivas ou sensíveis. */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirmar",
  destructive = false,
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown> | unknown;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  return (
    <A.Root open={isOpen} onOpenChange={(v) => !busy && setOpen(v)}>
      {trigger ? <A.Trigger asChild>{trigger}</A.Trigger> : null}
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <A.Content className="fixed left-1/2 top-[20vh] z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-xl border bg-popover p-5 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <A.Title className="text-base font-semibold">{title}</A.Title>
          {description ? <A.Description className="mt-2 text-sm text-muted-foreground">{description}</A.Description> : null}
          <div className="mt-5 flex justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="outline" disabled={busy}>
                Cancelar
              </Button>
            </A.Cancel>
            <Button
              variant={destructive ? "destructive" : "default"}
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}

"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay() {
  return (
    <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-[var(--overlay)] backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
  );
}

/**
 * Diálogo responsivo: no celular abre como "bottom sheet" (de baixo para cima),
 * no desktop como modal centralizado.
 */
export function DialogContent({
  className,
  children,
  title,
  description,
  hideClose,
  side = "auto",
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  hideClose?: boolean;
  side?: "auto" | "right";
}) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-[81] flex max-h-[92dvh] flex-col bg-elevated text-foreground shadow-float outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-md border-l border-border data-[state=open]:animate-fade-in"
            : "inset-x-0 bottom-0 rounded-t-[28px] border-t border-border data-[state=open]:animate-slide-up sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:border",
          className,
        )}
        {...props}
      >
        {side !== "right" && <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />}
        <div className="flex items-start justify-between gap-4 px-6 pt-4 pb-2 sm:pt-6">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-lg font-bold tracking-tight">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : "Diálogo"}</DialogPrimitive.Description>
            )}
          </div>
          {!hideClose && (
            <DialogPrimitive.Close className="-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Fechar">
              <X className="size-5" />
            </DialogPrimitive.Close>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

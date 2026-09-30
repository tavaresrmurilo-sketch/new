"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  side?: "right" | "bottom";
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex flex-col bg-surface shadow-pop focus:outline-none",
            side === "right"
              ? "sheet-right inset-y-0 right-0 w-full max-w-[440px] sm:rounded-l-2xl"
              : "sheet-bottom inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">Painel</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" aria-label="Fechar">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">{children}</div>
          {footer && <div className="border-t border-line px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

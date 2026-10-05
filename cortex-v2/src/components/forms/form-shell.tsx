"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Estrutura padrão de formulário: corpo rolável + rodapé de ações (dentro de diálogos ou páginas). */
export function FormShell({
  onSubmit,
  children,
  submitLabel = "Salvar",
  pending,
  onCancel,
  inDialog = true,
  extraActions,
  className,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  submitLabel?: string;
  pending?: boolean;
  onCancel?: () => void;
  inDialog?: boolean;
  extraActions?: React.ReactNode;
  className?: string;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className={cn("space-y-4", inDialog && "flex-1 overflow-y-auto px-5 py-4")}>{children}</div>
      <div className={cn("flex items-center gap-2", inDialog ? "border-t bg-subtle/50 px-5 py-3" : "pt-5")}>
        {extraActions}
        <div className="ml-auto flex gap-2">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
          ) : null}
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function FormSkeleton() {
  return (
    <div className="space-y-4 px-5 py-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-9 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

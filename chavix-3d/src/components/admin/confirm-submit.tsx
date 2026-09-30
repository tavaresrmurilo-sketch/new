"use client";

import { Button } from "@/components/ui/button";

/** Botão de envio que pede confirmação antes de ações destrutivas. */
export function ConfirmSubmit({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <Button
      type="submit"
      variant="outline"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}

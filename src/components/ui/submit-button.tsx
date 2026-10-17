"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/** Botão de envio que mostra carregamento enquanto a Server Action executa. */
export function SubmitButton({ children, pending: pendingProp, ...props }: ButtonProps & { pending?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending || pendingProp} {...props}>
      {children}
    </Button>
  );
}

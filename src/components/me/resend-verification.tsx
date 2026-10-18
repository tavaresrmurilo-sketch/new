"use client";

import { MailWarning } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/server/auth/actions";

/** Selo "e-mail não verificado" + reenvio do link de confirmação. */
export function UnverifiedEmailNotice({ email, compact }: { email: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const resend = () =>
    start(async () => {
      const res = await resendVerificationAction();
      if (res.status === "error") toast.error(res.message);
      else if (res.status === "success") toast.success("Link enviado", { description: res.message ?? `Confira a caixa de entrada de ${email}.` });
    });
  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-3 rounded-2xl border border-warning/25 bg-warning-soft p-3.5 sm:flex-row sm:items-center"}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold text-warning">
        <MailWarning className="size-3.5" aria-hidden /> E-mail não verificado
      </span>
      {!compact && <p className="flex-1 text-[13px] text-foreground/80">Confirme seu e-mail para receber lembretes e recuperar a conta se precisar.</p>}
      <Button size="sm" variant={compact ? "ghost" : "secondary"} onClick={resend} loading={pending} className="h-10 self-start sm:self-auto">
        Reenviar link
      </Button>
    </div>
  );
}

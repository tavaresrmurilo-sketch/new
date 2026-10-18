"use client";

import { MailCheck } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resendVerificationAction } from "@/server/auth/actions";

export function ResendVerificationButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await resendVerificationAction();
          if (res.status === "error") toast.error(res.message);
          else if (res.status === "success") toast.success(res.message ?? "Link enviado.");
        })
      }
    >
      <MailCheck /> Reenviar link de confirmação
    </Button>
  );
}

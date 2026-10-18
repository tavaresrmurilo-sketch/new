"use client";

import { ExternalLink } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { openPortalAction } from "@/server/billing/actions";

/** Abre o portal de cobrança do Stripe (cartão, notas fiscais, troca e cancelamento). */
export function PortalButton({ organizationId, children, ...props }: { organizationId: string } & Omit<ButtonProps, "onClick">) {
  const [pending, start] = useTransition();
  return (
    <Button
      {...props}
      loading={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("organizationId", organizationId);
          const res = await openPortalAction({ status: "idle" }, fd);
          if (res.status === "success" && res.data && /^https:\/\//i.test(res.data.url)) window.location.assign(res.data.url);
          else if (res.status === "error") toast.error(res.message);
        })
      }
    >
      {children ?? "Gerenciar cobrança e notas fiscais"}
      <ExternalLink />
    </Button>
  );
}

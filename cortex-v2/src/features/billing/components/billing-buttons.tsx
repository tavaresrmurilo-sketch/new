"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { openBillingPortalAction, startCheckoutAction } from "../actions";

export function CheckoutButton({ planId, interval, label }: { planId: string; interval: "monthly" | "yearly"; label: string }) {
  const { run, pending } = useAction(startCheckoutAction, { refresh: false, onSuccess: (d) => { window.location.href = d.url; } });
  return <Button size="sm" loading={pending} onClick={() => run({ planId, interval })}>{label}</Button>;
}

export function PortalButton() {
  const { run, pending } = useAction(openBillingPortalAction, { refresh: false, onSuccess: (d) => { window.location.href = d.url; } });
  return <Button size="sm" variant="outline" loading={pending} onClick={() => run({})}>Gerenciar pagamento</Button>;
}

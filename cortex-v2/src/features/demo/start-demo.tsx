"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { startDemoAction } from "./actions";

export function StartDemoButton() {
  const [pending, start] = React.useTransition();
  return (
    <Button size="lg" loading={pending} onClick={() => start(async () => { const r = await startDemoAction(); if (r?.error) toast.error(r.error); })}>
      Abrir demonstração
    </Button>
  );
}

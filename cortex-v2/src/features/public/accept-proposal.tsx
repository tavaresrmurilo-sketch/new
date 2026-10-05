"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { acceptPublicProposalAction } from "./actions";

export function AcceptProposal({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [agree, setAgree] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await acceptPublicProposalAction({ token, name, agree: agree as true });
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success("Aceite registrado. Obrigado!");
        router.refresh();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="acc-name">Seu nome completo</Label>
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        Declaro que li e aceito esta proposta, incluindo escopo, valores e condições.
      </label>
      <Button type="submit" loading={busy} disabled={!agree || name.trim().length < 3} className="w-full">
        Aceitar proposta
      </Button>
    </form>
  );
}

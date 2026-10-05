"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { createWorkspaceAction } from "../actions";

export function WorkspaceForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-4 rounded-lg border bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await createWorkspaceAction({ name });
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        router.push(r.data.redirectTo);
        router.refresh();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">Nome da empresa</Label>
        <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required minLength={2} />
      </div>
      <Button type="submit" className="w-full" loading={busy} disabled={name.trim().length < 2}>
        Criar workspace
      </Button>
    </form>
  );
}

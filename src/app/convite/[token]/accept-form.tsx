"use client";

import { Check } from "lucide-react";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/action";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { acceptInviteAction } from "@/server/team/actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const { state, onSubmit, pending } = useActionForm(acceptInviteAction, idle);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton variant="primary" size="lg" block pending={pending}>
        <Check /> Aceitar convite
      </SubmitButton>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { saveSettingsAction } from "@/server/admin/actions";
import { idle } from "@/lib/action";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cn } from "@/lib/utils";

type Mode = "all" | "new_orgs" | "none";

const MODES: { value: Mode; label: string; description: string; recommended?: boolean }[] = [
  {
    value: "new_orgs",
    label: "Apenas organizações novas",
    description: "Eventos passam por análise até a equipe marcar a organização como publicadora confiável (por exemplo, ao aprovar com “Aprovar e confiar”).",
    recommended: true,
  },
  { value: "all", label: "Todos os eventos", description: "Nada vai ao ar sem aprovação da equipe — mais seguro, porém mais lento para quem publica." },
  { value: "none", label: "Nenhum", description: "Eventos são publicados direto. Use só com equipe atenta às denúncias." },
];

export function SettingsForm({ initial }: { initial: { moderationMode: Mode; requireVerifiedEmail: boolean } }) {
  const router = useRouter();
  const { state, onSubmit, pending } = useActionForm(saveSettingsAction, idle);
  const [mode, setMode] = useState<Mode>(initial.moderationMode);
  const [verified, setVerified] = useState(initial.requireVerifiedEmail);

  useEffect(() => {
    if (state.status === "success") {
      toast.success(state.message ?? "Configurações salvas.");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <fieldset>
        <legend className="text-base font-bold">Moderação de eventos</legend>
        <p className="mt-0.5 mb-3 text-sm text-muted-foreground">Quais eventos precisam de aprovação antes de aparecer no mapa.</p>
        <div className="grid gap-2 lg:grid-cols-3">
          {MODES.map((m) => (
            <label
              key={m.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-2xl border p-4 transition",
                mode === m.value ? "border-primary bg-primary-soft/60" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name="moderationMode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} className="mt-1 size-4 shrink-0 accent-[var(--primary)]" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-bold">
                  {m.label}
                  {m.recommended && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">Recomendado</span>}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
        <input type="hidden" name="requireVerifiedEmail" value={verified ? "on" : ""} />
        <label htmlFor="require-verified" className="min-w-0 cursor-pointer">
          <span className="block text-sm font-bold">Exigir e-mail verificado para publicar</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
            Reduz contas descartáveis. Desligue apenas se o envio de e-mails não estiver configurado.
          </span>
        </label>
        <Switch id="require-verified" checked={verified} onCheckedChange={setVerified} />
      </div>

      <FormMessage state={state.status === "error" ? state : idle} />
      <div className="flex justify-end">
        <SubmitButton pending={pending} variant="primary" className="w-full sm:w-auto">
          Salvar configurações
        </SubmitButton>
      </div>
    </form>
  );
}

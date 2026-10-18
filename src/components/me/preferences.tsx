"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setPreferenceAction } from "@/server/me/actions";

export type PreferenceKey = "notifyEmail" | "notifyPush" | "marketingOptIn";
export type Preferences = Record<PreferenceKey, boolean>;

const ITEMS: { key: PreferenceKey; label: string; description: string }[] = [
  {
    key: "notifyEmail",
    label: "Avisos por e-mail",
    description: "Lembretes dos eventos da sua agenda, mudanças e cancelamentos, e novidades de quem você segue.",
  },
  {
    key: "notifyPush",
    label: "Notificações push",
    description: "Os mesmos avisos direto no celular ou no navegador, nos aparelhos em que você ativar abaixo.",
  },
  {
    key: "marketingOptIn",
    label: "Novidades do Mixtour",
    description: "De vez em quando, dicas de eventos e novidades do produto. Sem spam, e dá para sair quando quiser.",
  },
];

/** Interruptores de preferência com gravação imediata (otimista, com reversão em caso de erro). */
export function PreferenceSwitches({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [pendingKey, setPendingKey] = useState<PreferenceKey | null>(null);
  const [, start] = useTransition();

  const change = (key: PreferenceKey, value: boolean) => {
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value });
    setPendingKey(key);
    start(async () => {
      const res = await setPreferenceAction(key, value);
      setPendingKey(null);
      if (res.status !== "success" || !res.data) {
        setPrefs(prev);
        toast.error(res.status === "error" ? res.message : "Não foi possível salvar agora.");
        return;
      }
      setPrefs(res.data);
      toast.success("Preferência salva");
    });
  };

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {ITEMS.map((it) => (
        <li key={it.key} className="flex items-start gap-4 px-4 py-4">
          <div className="min-w-0 flex-1">
            <label htmlFor={`pref-${it.key}`} className="block cursor-pointer text-[15px] font-semibold">
              {it.label}
            </label>
            <p id={`pref-${it.key}-desc`} className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              {it.description}
            </p>
          </div>
          <Switch
            id={`pref-${it.key}`}
            checked={prefs[it.key]}
            disabled={pendingKey === it.key}
            onCheckedChange={(v) => change(it.key, v)}
            aria-describedby={`pref-${it.key}-desc`}
            className="mt-0.5"
          />
        </li>
      ))}
    </ul>
  );
}

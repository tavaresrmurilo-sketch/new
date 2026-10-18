"use client";

import { BellRing, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { nativePlatform } from "@/lib/native";

type NativePushState = "checking" | "granted" | "denied" | "prompt";

/** Notificações do app nativo (permissão do sistema + registro do aparelho). */
export function NativePushToggle() {
  const [state, setState] = useState<NativePushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    import("@capacitor/push-notifications")
      .then(({ PushNotifications }) => PushNotifications.checkPermissions())
      .then((p) => alive && setState(p.receive === "granted" ? "granted" : p.receive === "denied" ? "denied" : "prompt"))
      .catch(() => alive && setState("denied"));
    return () => {
      alive = false;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const p = await PushNotifications.requestPermissions();
      if (p.receive !== "granted") {
        setState("denied");
        toast.error("Permissão negada. Libere as notificações do Mixtour nos ajustes do aparelho.");
        return;
      }
      await PushNotifications.register(); // o NativePushSync envia o token ao servidor
      setState("granted");
      toast.success("Notificações ativadas neste aparelho.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
        <BellRing className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Notificações no celular</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {state === "granted"
            ? "Ativadas neste aparelho: lembretes de eventos, novidades de quem você segue e avisos importantes."
            : state === "denied"
              ? nativePlatform() === "ios"
                ? "Bloqueadas. Ative em Ajustes → Mixtour → Notificações."
                : "Bloqueadas. Ative em Configurações → Apps → Mixtour → Notificações."
              : "Receba lembretes antes dos eventos que você marcou e novidades de quem você segue."}
        </p>
      </div>
      {state === "prompt" && (
        <Button size="sm" variant="primary" onClick={enable} loading={busy}>
          Ativar
        </Button>
      )}
      {state === "denied" && <Settings className="mt-2 size-5 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
  );
}

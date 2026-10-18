"use client";

import { BellOff, BellRing, Info, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useIsClient } from "@/lib/hooks/use-is-client";
import { cn } from "@/lib/utils";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type PushState = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  // O registro automático só acontece em produção; ativar o push registra sob demanda.
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

async function detect(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/**
 * Push neste aparelho. Sem NEXT_PUBLIC_VAPID_PUBLIC_KEY, avisa que o recurso
 * não está configurado (nunca simula). Inscrição enviada a /api/push/subscribe.
 */
export function PushToggle() {
  const mounted = useIsClient();
  const [state, setState] = useState<PushState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return;
    let alive = true;
    detect()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  if (!VAPID_PUBLIC_KEY) {
    return (
      <div className="flex gap-3 rounded-2xl border border-border bg-surface-2/60 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">Notificações push ainda não configuradas nesta instalação.</span> Enquanto isso, você recebe tudo aqui no app e por e-mail.
        </p>
      </div>
    );
  }

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        if (permission === "denied") toast.error("Permissão negada. Libere as notificações do Mixtour nas configurações do navegador.");
        return;
      }
      const reg = await registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        await sub.unsubscribe().catch(() => undefined);
        toast.error(data.error ?? "Não foi possível ativar agora.");
        setState("off");
        return;
      }
      setState("on");
      toast.success("Push ativado neste aparelho");
    } catch (err) {
      console.error("[push]", err);
      toast.error("Este navegador não permitiu ativar as notificações push.");
      setState(await detect().catch(() => "unsupported" as const));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => undefined);
        await sub.unsubscribe().catch(() => undefined);
      }
      setState("off");
      toast("Push desativado neste aparelho");
    } finally {
      setBusy(false);
    }
  };

  const status: Record<PushState, string> = {
    checking: "Verificando…",
    unsupported: "Este navegador não oferece notificações push.",
    "ios-install": "No iPhone e no iPad, instale o Mixtour na Tela de Início (Compartilhar → Adicionar à Tela de Início) para receber push.",
    denied: "As notificações estão bloqueadas para o Mixtour neste navegador. Libere nas configurações do site e volte aqui.",
    off: "Receba lembretes e novidades mesmo com o app fechado.",
    on: "Ativado — este aparelho recebe lembretes e novidades.",
  };
  const on = state === "on";
  const disabled = !mounted || busy || state === "checking" || state === "unsupported" || state === "ios-install" || state === "denied";

  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-border p-4">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", on ? "bg-success-soft text-success" : "bg-surface-2 text-muted-foreground")}>
        {state === "ios-install" ? <Smartphone className="size-5" /> : on ? <BellRing className="size-5" /> : <BellOff className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor="push-device" className="block text-[15px] font-semibold">
          Push neste aparelho
        </label>
        <p className="mt-0.5 text-[13px] text-muted-foreground" aria-live="polite">
          {status[state]}
        </p>
      </div>
      <Switch id="push-device" checked={on} disabled={disabled} onCheckedChange={(v) => (v ? enable() : disable())} aria-label="Push neste aparelho" className="mt-1" />
    </div>
  );
}

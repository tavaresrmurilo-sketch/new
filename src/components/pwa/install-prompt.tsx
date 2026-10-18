"use client";

import { Share, SquarePlus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HIDE_BOTTOM_NAV } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STORAGE_KEY = "mx-install-dismissed-at";
const SNOOZE_DAYS = 30;
const SHOW_DELAY_MS = 12_000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_DAYS * 86_400_000;
  } catch {
    return true;
  }
}

function remember() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* navegação privada: tudo bem não lembrar */
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Safari de verdade (não apps com navegador embutido nem outros navegadores).
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV/.test(ua);
}

/**
 * Convite discreto para instalar o app: usa o beforeinstallprompt (Android/Chrome/Edge)
 * ou mostra a instrução do Safari no iOS. Dispensável e lembrado por 30 dias.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"native" | "ios" | null>(null);

  useEffect(() => {
    if (isNativeApp() || isStandalone() || dismissedRecently()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      clearTimeout(timer);
      timer = setTimeout(() => setMode("native"), SHOW_DELAY_MS);
    };
    const onInstalled = () => {
      setMode(null);
      setDeferred(null);
      remember();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (isIosSafari()) timer = setTimeout(() => setMode("ios"), SHOW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Não cobre o mapa da home nem telas com ação fixa no rodapé.
  const hiddenHere = pathname === "/" || HIDE_BOTTOM_NAV.some((r) => r.test(pathname));
  if (!mode || hiddenHere) return null;

  const dismiss = () => {
    remember();
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    setDeferred(null);
    setMode(null);
    if (choice.outcome !== "accepted") remember();
  };

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-title"
      className="glass fixed inset-x-3 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+12px)] z-[60] mx-auto max-w-md animate-slide-up rounded-3xl border border-border p-4 shadow-float lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[380px]"
    >
      <div className="flex items-start gap-3.5">
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-2xl shadow-card" />
        <div className="min-w-0 flex-1">
          <p id="install-title" className="text-[15px] font-bold tracking-tight">
            Instale o Mixtour
          </p>
          {mode === "native" ? (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">Abra o mapa com um toque e receba os alertas da sua agenda, como um app.</p>
          ) : (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              Toque em <Share className="inline size-4 align-[-3px] text-info" aria-label="Compartilhar" /> <strong className="text-foreground">Compartilhar</strong> e depois em{" "}
              <SquarePlus className="inline size-4 align-[-3px]" aria-hidden /> <strong className="text-foreground">Adicionar à Tela de Início</strong>.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar convite de instalação"
          className="-mt-1.5 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>
      {mode === "native" && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-10" onClick={dismiss}>
            Agora não
          </Button>
          <Button variant="primary" size="sm" className="h-10" onClick={install}>
            Instalar app
          </Button>
        </div>
      )}
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { CommandBar, CommandBarHandle } from "../components/CommandBar";
import { ContextPanel } from "../components/ContextPanel";
import { InitSequence } from "../components/InitSequence";
import { JarvisCore } from "../components/JarvisCore";
import { LiveTranscript } from "../components/LiveTranscript";
import { MODULE_KEYS, ModuleDock } from "../components/ModuleDock";
import { ModuleSheet } from "../components/ModuleSheet";
import { Onboarding } from "../components/Onboarding";
import { PermissionDialog } from "../components/PermissionDialog";
import { SystemPanel } from "../components/SystemPanel";
import { Toasts } from "../components/Toasts";
import { TopBar } from "../components/TopBar";
import { bridge } from "../lib/bridge";
import { runtime } from "../runtime";
import { useStore } from "../state/store";

function EngineGate() {
  const backend = useStore((s) => s.backend);
  const conn = useStore((s) => s.conn);
  if (conn === "online") return null;
  const missing = backend?.status === "missing";
  const crashed = backend?.status === "offline" || backend?.status === "crashed";
  return (
    <div className="gate" role="status" aria-live="polite">
      <p className="t-label">{missing ? "Engine não encontrado" : crashed ? "Engine indisponível" : conn === "reconnecting" ? "Reconectando ao engine" : "Inicializando"}</p>
      <p className="t-sm t-muted">{backend?.detail || "Conectando ao Jarvis Engine…"}</p>
      {(missing || crashed) && bridge().isDesktop && (
        <button type="button" className="btn btn--sm" onClick={() => void bridge().backend.restart()}>Tentar novamente</button>
      )}
      {!bridge().isDesktop && missing && <p className="t-xs t-muted">No navegador, abra com ?engine=ws://127.0.0.1:PORTA/ws&amp;token=TOKEN</p>}
    </div>
  );
}

export function Hud() {
  const settings = useStore((s) => s.settings);
  const conn = useStore((s) => s.conn);
  const module = useStore((s) => s.module);
  const openModule = useStore((s) => s.openModule);
  const initRequested = useStore((s) => s.initRequested);
  const requestInit = useStore((s) => s.requestInit);
  const commandRef = useRef<CommandBarHandle>(null);
  const [showInit, setShowInit] = useState(false);
  const onboarding = conn === "online" && settings && !settings.general.onboarding_complete;

  useEffect(() => {
    if (initRequested) {
      setShowInit(true);
      requestInit(false);
    }
  }, [initRequested, requestInit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
      if (e.altKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        const m = MODULE_KEYS[Number(e.key) - 1];
        openModule(useStore.getState().module === m ? null : m);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        commandRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (useStore.getState().permissions.length) return; // dialog handles it
        if (useStore.getState().module) {
          openModule(null);
          return;
        }
        runtime.interrupt();
        return;
      }
      if (!typing && e.key === "/") {
        e.preventDefault();
        commandRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openModule]);

  const compact = settings?.appearance.compact_mode;
  return (
    <div className={`hud${module ? ` has-sheet has-sheet--${["memory", "notes", "reminders", "tasks"].includes(module) ? "left" : "right"}` : ""}${compact ? " is-compact" : ""}`}>
      <div className="hud__floor" aria-hidden="true" />
      <TopBar />
      <main className="hud__main" aria-label="Jarvis">
        <SystemPanel />
        <div className="hud__center">
          <JarvisCore particles={compact ? 420 : 720} />
          <LiveTranscript />
        </div>
        <ContextPanel />
      </main>
      <footer className="hud__footer">
        <ModuleDock side="left" />
        <CommandBar ref={commandRef} />
        <ModuleDock side="right" />
      </footer>
      <ModuleSheet />
      <EngineGate />
      <PermissionDialog />
      <Toasts />
      {onboarding && <Onboarding onFinish={() => setShowInit(true)} />}
      {showInit && !onboarding && <InitSequence onDone={() => setShowInit(false)} />}
    </div>
  );
}

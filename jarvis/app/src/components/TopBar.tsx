import { useEffect, useState } from "react";
import { bridge } from "../lib/bridge";
import { clock, longDate } from "../lib/format";
import { runtime } from "../runtime";
import { useStore } from "../state/store";
import { IconBell, IconClose, IconCloud, IconFocus, IconMic, IconMicOff, IconMinus, IconScreen, IconSquare } from "./icons";
import { NotificationCenter } from "./NotificationCenter";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="clock" aria-label={`${clock(now)}, ${longDate(now)}`}>
      <span className="t-num clock__time">{clock(now)}</span>
      <span className="t-xs t-muted clock__date">{longDate(now)}</span>
    </div>
  );
}

export function ConnectionStatus() {
  const conn = useStore((s) => s.conn);
  const backend = useStore((s) => s.backend);
  const label =
    backend && backend.status !== "online" && backend.status !== "starting"
      ? backend.status === "missing" ? "Engine ausente" : "Engine offline"
      : conn === "online" ? "Online" : conn === "reconnecting" ? "Reconectando" : conn === "connecting" ? "Conectando" : "Offline";
  const cls = conn === "online" ? "chip--ok" : conn === "offline" ? "chip--danger" : "chip--warn";
  return (
    <span className={`chip ${cls}`} role="status" title={backend?.detail || label}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Permanent privacy indicators: microphone, screen capture, external AI, tool execution. */
function PrivacyIndicators() {
  const audio = useStore((s) => s.audio);
  const voiceEnabled = useStore((s) => s.settings?.voice.enabled ?? false);
  const capturing = useStore((s) => s.capturingScreen);
  const externalAt = useStore((s) => s.externalAt);
  const externalProvider = useStore((s) => s.externalProvider);
  const provider = useStore((s) => s.provider);
  const focus = useStore((s) => s.focusMode);
  const tools = useStore((s) => s.tools);
  const executing = tools.some((t) => t.status === "running");
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((n) => n + 1), 2000);
    return () => window.clearInterval(t);
  }, []);
  const externalRecent = externalAt !== null && Date.now() - externalAt < 6000;
  const micActive = voiceEnabled && audio.ready && !audio.micMuted;
  return (
    <div className="indicators" aria-label="Indicadores de privacidade">
      <button
        type="button"
        className={`chip ${micActive ? (audio.capturing ? "chip--live is-pulse" : "chip--live") : ""}`}
        onClick={() => runtime.setMicMuted(!audio.micMuted)}
        disabled={!voiceEnabled || runtime.kind !== "main"}
        aria-pressed={micActive}
        title={micActive ? (audio.wakePaused ? "Microfone ativo · palavra de ativação pausada" : "Microfone ativo (ouvindo a palavra de ativação)") : audio.micError || "Microfone desligado"}
      >
        {micActive ? <IconMic size={12} /> : <IconMicOff size={12} />}
        {micActive ? (audio.capturing ? "Ouvindo" : audio.wakePaused ? "Mic · pausado" : "Mic ativo") : "Mic off"}
      </button>
      {capturing && (
        <span className="chip chip--danger is-pulse" role="status">
          <IconScreen size={12} /> Capturando tela
        </span>
      )}
      {executing && (
        <span className="chip chip--warn" role="status">
          <span className="dot" aria-hidden="true" /> Executando
        </span>
      )}
      {(externalRecent || provider?.external) && (
        <span className={`chip ${externalRecent ? "chip--warn is-pulse" : ""}`} title={externalRecent ? `Enviando dados para ${externalProvider}` : `Provedor externo configurado: ${provider?.label}`}>
          <IconCloud size={12} /> {externalRecent ? `Enviando a ${externalProvider}` : "IA externa"}
        </span>
      )}
      {focus && (
        <span className="chip chip--live" title="Modo foco: alertas proativos silenciados">
          <IconFocus size={12} /> Foco
        </span>
      )}
    </div>
  );
}

function MiniMetrics() {
  const m = useStore((s) => s.metrics);
  if (!m) return null;
  const items: [string, string][] = [
    ["CPU", `${Math.round(m.cpu.percent)}%`],
    ["RAM", `${Math.round(m.memory.percent)}%`],
    ["NET", m.network.connected === null ? "N/A" : m.network.connected ? "on" : "off"],
    ["BAT", m.battery ? `${Math.round(m.battery.percent)}%` : "N/A"],
  ];
  return (
    <dl className="mini-metrics">
      {items.map(([k, v]) => (
        <div key={k} className="mini-metrics__item">
          <dt className="t-label">{k}</dt>
          <dd className="t-num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TopBar() {
  const [open, setOpen] = useState(false);
  const notifications = useStore((s) => s.notifications);
  const provider = useStore((s) => s.provider);
  const unread = notifications.filter((n) => !n.read).length;
  const b = bridge();
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <h1 className="t-mark wordmark">J.A.R.V.I.S.</h1>
        <div className="topbar__status">
          <ConnectionStatus />
          {provider && (
            <span className={`chip ${provider.ok ? "" : "chip--warn"}`} title={provider.detail}>
              {provider.ok ? `${provider.label.replace(" (local)", "")} · ${provider.model || "auto"}` : "IA offline"}
            </span>
          )}
        </div>
      </div>
      <div className="topbar__drag" aria-hidden="true" />
      <PrivacyIndicators />
      <MiniMetrics />
      <Clock />
      <div className="topbar__actions">
        <button type="button" className="btn btn--ghost btn--icon notif-btn" onClick={() => setOpen((v) => !v)} aria-label={`Notificações${unread ? ` (${unread} novas)` : ""}`} aria-expanded={open}>
          <IconBell size={16} />
          {unread > 0 && <span className="notif-btn__badge t-num">{unread > 9 ? "9+" : unread}</span>}
        </button>
        {b.isDesktop && (
          <>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => b.window.minimize()} aria-label="Minimizar">
              <IconMinus size={16} />
            </button>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => b.window.toggleMaximize()} aria-label="Maximizar ou restaurar">
              <IconSquare size={14} />
            </button>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => b.window.close()} aria-label="Fechar para a bandeja">
              <IconClose size={16} />
            </button>
          </>
        )}
      </div>
      {open && <NotificationCenter onClose={() => setOpen(false)} />}
    </header>
  );
}

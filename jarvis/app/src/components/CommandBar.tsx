import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { runtime } from "../runtime";
import { useStore } from "../state/store";
import { IconMic, IconMicOff, IconSend } from "./icons";

export interface CommandBarHandle {
  focus(): void;
}

export const CommandBar = forwardRef<CommandBarHandle, { compact?: boolean; autoFocus?: boolean; onSubmitted?: () => void }>(function CommandBar({ compact, autoFocus, onSubmitted }, ref) {
  const [text, setText] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const conn = useStore((s) => s.conn);
  const audio = useStore((s) => s.audio);
  const voiceEnabled = useStore((s) => s.settings?.voice.enabled ?? false);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));
  const online = conn === "online";

  const submit = (value = text) => {
    const v = value.trim();
    if (!v || !online) return;
    if (runtime.command(v)) {
      setHistory((h) => [v, ...h.filter((x) => x !== v)].slice(0, 30));
      setText("");
      setCursor(-1);
      onSubmitted?.();
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && history.length) {
      e.preventDefault();
      const next = Math.min(history.length - 1, cursor + 1);
      setCursor(next);
      setText(history[next]);
    } else if (e.key === "ArrowDown" && cursor >= 0) {
      e.preventDefault();
      const next = cursor - 1;
      setCursor(next);
      setText(next >= 0 ? history[next] : "");
    }
  };

  const micLabel = !voiceEnabled
    ? "Voz desativada nas configurações"
    : audio.micError
      ? audio.micError
      : audio.micMuted
        ? "Microfone silenciado — clique para reativar"
        : "Falar agora (Ctrl+Shift+Espaço)";

  return (
    <form className={`command${compact ? " command--compact" : ""}`} onSubmit={(e) => { e.preventDefault(); submit(); }} role="search" aria-label="Comando para o Jarvis">
      <button
        type="button"
        className={`command__mic${audio.capturing ? " is-live" : ""}${audio.micMuted || audio.micError ? " is-off" : ""}`}
        onClick={() => (audio.micMuted ? runtime.setMicMuted(false) : runtime.listenNow())}
        onContextMenu={(e) => { e.preventDefault(); runtime.setMicMuted(!audio.micMuted); }}
        disabled={!voiceEnabled || runtime.kind !== "main"}
        aria-label={micLabel}
        title={`${micLabel} · botão direito: silenciar`}
      >
        {audio.micMuted || audio.micError ? <IconMicOff size={18} /> : <IconMic size={18} />}
      </button>
      <input
        ref={inputRef}
        className="command__input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder={online ? "Ask Jarvis…" : "Aguardando conexão com o engine…"}
        aria-label="Digite um comando"
        autoFocus={autoFocus}
        maxLength={4000}
        spellCheck={false}
      />
      <button type="submit" className="command__send" disabled={!online || !text.trim()} aria-label="Enviar comando">
        <IconSend size={18} />
      </button>
    </form>
  );
});

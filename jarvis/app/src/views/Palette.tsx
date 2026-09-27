import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CommandBar, CommandBarHandle } from "../components/CommandBar";
import { bridge } from "../lib/bridge";
import { displayState, STATE_LABEL, useStore } from "../state/store";

const QUICK = ["Qual é o status do sistema?", "Abra o navegador", "Procure meus projetos", "Mostre minhas notas"];

/** Global command palette (Ctrl+Space): type, press Enter, see the answer, Esc to dismiss. */
export function Palette() {
  const ref = useRef<CommandBarHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [since, setSince] = useState(() => Date.now() / 1000);
  const transcript = useStore((s) => s.transcript);
  const state = useStore((s) => displayState(s));
  const replies = transcript.filter((t) => t.ts >= since - 0.5).slice(-3);

  useEffect(() => {
    const b = bridge();
    const off = b.palette.onShown(() => {
      setSince(Date.now() / 1000);
      ref.current?.focus();
    });
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && b.palette.hide();
    window.addEventListener("keydown", onKey);
    return () => {
      off();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useLayoutEffect(() => {
    const h = rootRef.current?.getBoundingClientRect().height;
    if (h) bridge().palette.resize(Math.ceil(h) + 24);
  }, [replies.length, transcript]);

  return (
    <div className="palette" ref={rootRef}>
      <div className="palette__head">
        <span className="t-mark palette__mark">Jarvis</span>
        <span className={`t-label palette__state state--${state.toLowerCase()}`}>{STATE_LABEL[state]}</span>
      </div>
      <CommandBar ref={ref} compact autoFocus />
      {replies.length > 0 ? (
        <ol className="palette__replies">
          {replies.map((r) => (
            <li key={r.id} className={`line line--${r.role}`}>
              <span className="line__who t-label">{r.role === "user" ? "User" : "Jarvis"}</span>
              <span className="line__text selectable">{r.text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="palette__quick" role="list">
          {QUICK.map((q) => (
            <span key={q} role="listitem" className="chip">{q}</span>
          ))}
        </div>
      )}
      <p className="t-xs t-dim palette__hint">Enter envia · Esc fecha · ↑ histórico</p>
    </div>
  );
}

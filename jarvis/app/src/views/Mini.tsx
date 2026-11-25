import { CommandBar } from "../components/CommandBar";
import { JarvisCore } from "../components/JarvisCore";
import { IconSquare } from "../components/icons";
import { bridge } from "../lib/bridge";
import { useStore } from "../state/store";

/** MINI mode: a small floating widget (core + last reply + input). Audio stays in the hidden main window. */
export function Mini() {
  const last = useStore((s) => [...s.transcript].reverse().find((t) => t.role === "jarvis"));
  const conn = useStore((s) => s.conn);
  const running = useStore((s) => Object.values(s.tasks).find((t) => t.status === "running"));
  return (
    <div className="mini">
      <div className="mini__drag" aria-hidden="true" />
      <button type="button" className="btn btn--ghost btn--icon mini__expand" onClick={() => void bridge().window.setMode("full")} aria-label="Abrir HUD completo">
        <IconSquare size={14} />
      </button>
      <div className="mini__core">
        <JarvisCore particles={320} interactive={false} />
      </div>
      <p className="mini__reply t-sm" aria-live="polite">
        {conn !== "online" ? "Conectando…" : running ? `${running.title} · ${Math.round(running.progress * 100)}%` : last?.text ?? "Diga “Jarvis”."}
      </p>
      <CommandBar compact />
    </div>
  );
}

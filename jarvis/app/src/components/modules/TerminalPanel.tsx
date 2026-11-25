import { useEffect, useMemo, useRef, useState } from "react";
import { act } from "../../hooks";
import { duration } from "../../lib/format";
import type { TerminalProcess } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { IconStop } from "../icons";
import { Empty } from "../primitives";

const STATUS: Record<string, string> = { running: "em execução", exited: "finalizado", killed: "encerrado", failed: "falhou" };

function Output({ proc }: { proc: TerminalProcess }) {
  const lines = useStore((s) => s.terminalOutput[proc.id]);
  const setOutput = useStore((s) => s.setTerminalOutput);
  const ref = useRef<HTMLPreElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => {
    if (lines === undefined) {
      void runtime.rpc<TerminalProcess>("terminal.output", { id: proc.id }).then((p) => setOutput(proc.id, p.output ?? [])).catch(() => setOutput(proc.id, []));
    }
  }, [proc.id, lines, setOutput]);
  useEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, follow]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (proc.status !== "running") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [proc.status]);
  const dur = proc.status === "running" ? (now / 1000 - proc.startedAt) : proc.durationS;
  return (
    <div className="term">
      <dl className="term__meta">
        <div><dt className="t-label">Command</dt><dd className="t-num selectable">{proc.command}</dd></div>
        <div><dt className="t-label">Status</dt><dd className={`term__status term__status--${proc.status}`}>{STATUS[proc.status] ?? proc.status}{proc.exitCode !== null ? ` (código ${proc.exitCode})` : ""}</dd></div>
        <div><dt className="t-label">Duration</dt><dd className="t-num">{duration(dur)}</dd></div>
        {proc.ports.length > 0 && <div><dt className="t-label">Portas</dt><dd className="t-num">{proc.ports.join(", ")}</dd></div>}
      </dl>
      <div className="row">
        <label className="toggle t-xs"><input type="checkbox" role="switch" checked={follow} onChange={(e) => setFollow(e.target.checked)} /><span>Acompanhar saída</span></label>
        <span className="grow" />
        {proc.status === "running" && (
          <button type="button" className="btn btn--danger btn--sm" onClick={() => void act(() => runtime.rpc("terminal.stop", { id: proc.id }), "Processo encerrado")}>
            <IconStop size={14} /> Parar
          </button>
        )}
      </div>
      <pre ref={ref} className="term__output scroll selectable" aria-label="Saída do processo" tabIndex={0}>
        {(lines ?? []).join("\n") || "(sem saída)"}
      </pre>
    </div>
  );
}

export function TerminalPanel() {
  const procs = useStore((s) => s.terminal);
  const list = useMemo(() => Object.values(procs).sort((a, b) => b.startedAt - a.startedAt), [procs]);
  const [selected, setSelected] = useState<string | null>(null);
  const current = list.find((p) => p.id === selected) ?? list[0];
  return (
    <div className="module module--split">
      <p className="t-sm t-muted module__intro">
        Apenas comandos classificados e validados (scripts do package.json, testes, git). O Jarvis não executa linhas de comando livres.
      </p>
      {list.length === 0 ? (
        <Empty title="Nenhum processo">Diga “execute os testes” ou “abra meu projeto BETA e coloque ele para rodar”.</Empty>
      ) : (
        <>
          <div className="chips" role="tablist" aria-label="Processos">
            {list.slice(0, 8).map((p) => (
              <button key={p.id} type="button" role="tab" className={`chip ${p.status === "running" ? "chip--live" : p.exitCode ? "chip--danger" : ""}`} aria-pressed={current?.id === p.id} aria-selected={current?.id === p.id} onClick={() => setSelected(p.id)}>
                {p.status === "running" && <span className="dot" aria-hidden="true" />}
                {p.label}
              </button>
            ))}
          </div>
          {current && <Output key={current.id} proc={current} />}
        </>
      )}
    </div>
  );
}

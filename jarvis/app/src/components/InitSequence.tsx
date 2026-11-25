import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { play } from "../audio/sounds";
import type { InitCheck } from "../lib/types";
import { runtime } from "../runtime";

const ORDER = ["Voice Engine", "Memory", "System Monitor", "AI Provider", "Tool Registry", "File Intelligence", "App Registry"];
const WORD: Record<InitCheck["status"], string> = { online: "ONLINE", degraded: "DEGRADED", offline: "OFFLINE" };

/** SYSTEM INITIALIZATION: every line is a real module check; nothing is shown ONLINE unless it is. */
export function InitSequence({ onDone }: { onDone: () => void }) {
  const [checks, setChecks] = useState<InitCheck[] | null>(null);
  const [shown, setShown] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    runtime
      .rpc<InitCheck[]>("init.checks", {}, 30000)
      .then((c) => setChecks([...c].sort((a, b) => ORDER.indexOf(a.module) - ORDER.indexOf(b.module))))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!checks || shown >= checks.length) return;
    const t = window.setTimeout(() => {
      setShown((n) => n + 1);
      play(checks[shown].status === "online" ? "confirm" : "error");
    }, 260);
    return () => window.clearTimeout(t);
  }, [checks, shown]);

  const done = checks !== null && shown >= checks.length;
  const allOnline = done && checks!.every((c) => c.status === "online");
  const failed = done ? checks!.filter((c) => c.status !== "online") : [];

  useEffect(() => {
    if (done) play(allOnline ? "complete" : "notify");
  }, [done, allOnline]);

  return (
    <div className="init" role="dialog" aria-modal="true" aria-labelledby="init-title">
      <div className="init__panel">
        <h2 id="init-title" className="t-mark init__title">System initialization</h2>
        {error && <p className="notice notice--error">Não consegui executar as verificações: {error}</p>}
        <ol className="init__list" aria-live="polite">
          {(checks ?? []).slice(0, shown).map((c) => (
            <motion.li key={c.module} className={`init__row init__row--${c.status}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
              <span className="init__name">{c.module}</span>
              <span className="init__dots" aria-hidden="true" />
              <span className="init__status t-num">{WORD[c.status]}</span>
              <span className="init__detail t-xs t-muted">{c.detail}</span>
            </motion.li>
          ))}
          {!checks && !error && <li className="t-sm t-muted">Verificando módulos…</li>}
        </ol>
        {done && (
          <motion.div className="init__final" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <p className={`t-mark init__banner${allOnline ? "" : " is-partial"}`}>{allOnline ? "Jarvis online" : "Jarvis online — modo parcial"}</p>
            {!allOnline && (
              <p className="t-sm t-muted">
                {failed.map((f) => f.module).join(", ")} {failed.length > 1 ? "precisam" : "precisa"} de atenção. O restante funciona normalmente; ajuste em Configurações.
              </p>
            )}
            <button type="button" className="btn btn--primary" onClick={onDone} autoFocus>
              Continuar
            </button>
          </motion.div>
        )}
        {error && <button type="button" className="btn" onClick={onDone}>Fechar</button>}
      </div>
    </div>
  );
}

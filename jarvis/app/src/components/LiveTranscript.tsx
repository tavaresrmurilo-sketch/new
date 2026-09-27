import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useStore } from "../state/store";

/** Bottom stage: the latest exchange, large; earlier lines fade upward. */
export function LiveTranscript() {
  const transcript = useStore((s) => s.transcript);
  const transcribing = useStore((s) => s.audio.transcribing);
  const [expanded, setExpanded] = useState<string | null>(null);
  const lines = transcript.slice(-4);
  const lastJarvis = [...transcript].reverse().find((t) => t.role === "jarvis" && !t.streaming);

  return (
    <section className="transcript" aria-label="Transcrição">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {lastJarvis ? `Jarvis: ${lastJarvis.text}` : ""}
      </div>
      {lines.length === 0 && !transcribing ? (
        <p className="transcript__hint t-sm t-muted">
          Diga <strong>“Jarvis”</strong> ou digite um comando abaixo.
        </p>
      ) : (
        <ol className="transcript__list">
          <AnimatePresence initial={false}>
            {lines.map((e, i) => {
              const age = lines.length - 1 - i;
              return (
                <motion.li
                  key={e.id}
                  className={`line line--${e.role}${e.kind === "error" ? " line--error" : ""}`}
                  initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                  animate={{ opacity: age === 0 ? 1 : age === 1 ? 0.62 : 0.32, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                >
                  <span className="line__who t-label">{e.role === "user" ? "User" : "Jarvis"}</span>
                  <span className={`line__text selectable${e.streaming ? " is-streaming" : ""}`}>{e.text}</span>
                  {e.kind === "error" && e.detail && (
                    <button type="button" className="btn btn--ghost btn--sm line__detail-btn" aria-expanded={expanded === e.id} onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                      {expanded === e.id ? "Ocultar detalhes" : "Detalhes técnicos"}
                    </button>
                  )}
                  {expanded === e.id && e.detail && <pre className="line__detail selectable">{e.detail}</pre>}
                </motion.li>
              );
            })}
          </AnimatePresence>
          {transcribing && (
            <li className="line line--user line--pending" aria-label="Transcrevendo sua fala">
              <span className="line__who t-label">User</span>
              <span className="line__text t-muted">transcrevendo…</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}

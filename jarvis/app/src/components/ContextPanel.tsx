import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { ago } from "../lib/format";
import type { Task, ToolEvent } from "../lib/types";
import { runtime } from "../runtime";
import { useStore } from "../state/store";
import { IconStop } from "./icons";

const STEP_GLYPH: Record<string, string> = { pending: "○", running: "◐", completed: "●", failed: "✕", cancelled: "–", skipped: "·" };

export function TaskProgress({ task, compact = false }: { task: Task; compact?: boolean }) {
  const pct = Math.round(task.progress * 100);
  const blocks = 10;
  const filled = Math.round(task.progress * blocks);
  const running = task.status === "running" || task.status === "pending";
  return (
    <div className={`task task--${task.status}`}>
      <div className="task__head">
        <span className="task__title">{task.title}</span>
        {running && (
          <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => void runtime.rpc("tasks.cancel", { id: task.id })} aria-label={`Cancelar tarefa ${task.title}`} title="Cancelar">
            <IconStop size={14} />
          </button>
        )}
      </div>
      <div className="task__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Progresso: ${task.title}`}>
        <span className="t-num task__blocks" aria-hidden="true">
          {"█".repeat(filled)}
          <span className="t-dim">{"░".repeat(blocks - filled)}</span>
        </span>
        <span className="t-num task__pct">{pct}%</span>
      </div>
      {!compact && (
        <ol className="task__steps">
          {task.steps.map((s) => (
            <li key={s.idx} className={`step step--${s.status}`}>
              <span className="step__glyph" aria-hidden="true">{STEP_GLYPH[s.status] ?? "○"}</span>
              <span className="step__title">{s.title}</span>
              <span className="sr-only">({s.status})</span>
              {s.detail && s.status !== "pending" && <span className="step__detail t-xs t-muted">{s.detail}</span>}
            </li>
          ))}
        </ol>
      )}
      {task.status === "failed" && task.error && !compact && <p className="t-xs task__error">{task.error}</p>}
    </div>
  );
}

function ToolLine({ t }: { t: ToolEvent }) {
  return (
    <li className={`tool tool--${t.status}`}>
      <span className="tool__dot" aria-hidden="true" />
      <span className="tool__summary">{t.summary}</span>
      <span className="t-xs t-muted tool__meta">
        {t.status === "running" ? "executando" : t.durationMs !== undefined ? `${t.durationMs} ms` : ""}
        {t.verified === true ? " · verificado" : ""}
      </span>
    </li>
  );
}

/** Right rail: what Jarvis is doing now, on which app, and what comes next. */
export function ContextPanel() {
  const tasks = useStore((s) => s.tasks);
  const tools = useStore((s) => s.tools);
  const metrics = useStore((s) => s.metrics);
  const context = useStore((s) => s.context);
  const running = useMemo(() => Object.values(tasks).filter((t) => t.status === "running" || t.status === "pending").sort((a, b) => b.createdAt - a.createdAt), [tasks]);
  const recent = useMemo(() => Object.values(tasks).filter((t) => t.status !== "running" && t.status !== "pending" && t.steps.length > 1).sort((a, b) => b.updatedAt - a.updatedAt)[0], [tasks]);
  const current = running[0] ?? null;
  const runningTool = [...tools].reverse().find((t) => t.status === "running");
  const nextSteps = current ? current.steps.filter((s) => s.status === "pending").slice(0, 3) : [];
  const active = metrics?.activeWindow;

  return (
    <section className="rail rail--right" aria-labelledby="ctx-title">
      <h2 id="ctx-title" className="rail__title t-label">Context</h2>
      <div className="ctx-grid">
        <div className="ctx-item">
          <span className="t-label">Tarefa atual</span>
          <AnimatePresence mode="wait" initial={false}>
            {current ? (
              <motion.div key={current.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <TaskProgress task={current} />
              </motion.div>
            ) : (
              <motion.p key="none" className="t-sm t-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                Nenhuma tarefa em andamento.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div className="ctx-item">
          <span className="t-label">Aplicativo ativo</span>
          <p className="ctx-item__value">{active ? active.process.replace(/\.exe$/i, "") || "—" : "N/A"}</p>
          {active?.title && <p className="t-xs t-muted ctx-item__sub" title={active.title}>{active.title}</p>}
        </div>
        <div className="ctx-item">
          <span className="t-label">Ação atual</span>
          <p className="ctx-item__value">{runningTool?.summary ?? context?.currentAction ?? "Em espera"}</p>
        </div>
        <div className="ctx-item">
          <span className="t-label">Próximos passos</span>
          {nextSteps.length ? (
            <ol className="next-steps">
              {nextSteps.map((s) => (
                <li key={s.idx}>{s.title}</li>
              ))}
            </ol>
          ) : (
            <p className="t-sm t-muted">—</p>
          )}
        </div>
      </div>
      {recent && !current && (
        <div className="rail__block">
          <h3 className="t-label rail__subtitle">Última tarefa</h3>
          <TaskProgress task={recent} compact />
        </div>
      )}
      <div className="rail__block rail__block--grow">
        <h3 className="t-label rail__subtitle">Linha do tempo</h3>
        {tools.length === 0 ? (
          <p className="t-xs t-muted">As ações executadas aparecem aqui.</p>
        ) : (
          <ol className="timeline scroll" aria-live="polite" aria-relevant="additions">
            {[...tools].reverse().slice(0, 12).map((t) => (
              <ToolLine key={t.key} t={t} />
            ))}
          </ol>
        )}
      </div>
      {context?.session && (
        <p className="t-xs t-muted rail__foot">Sessão iniciada {ago(context.session.startedAt * 1000)} · {context.session.commands} comandos</p>
      )}
    </section>
  );
}

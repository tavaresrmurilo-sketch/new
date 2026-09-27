import { useMemo } from "react";
import { act, useRpc } from "../../hooks";
import { when } from "../../lib/format";
import type { Task } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { TaskProgress } from "../ContextPanel";
import { Empty } from "../primitives";

const STATUS_LABEL: Record<string, string> = { pending: "pendente", running: "executando", completed: "concluída", failed: "falhou", cancelled: "cancelada" };

export function TasksPanel() {
  const live = useStore((s) => s.tasks);
  const { data } = useRpc<Task[]>("tasks.list", { limit: 40 }, []);
  const tasks = useMemo(() => {
    const merged: Record<string, Task> = {};
    for (const t of data ?? []) merged[t.id] = t;
    for (const t of Object.values(live)) merged[t.id] = t;
    return Object.values(merged).sort((a, b) => b.createdAt - a.createdAt);
  }, [data, live]);
  const running = tasks.filter((t) => t.status === "running" || t.status === "pending");

  return (
    <div className="module">
      <div className="module__toolbar">
        <p className="t-sm t-muted grow">{running.length ? `${running.length} em execução` : "Nenhuma tarefa em execução"}</p>
        <button type="button" className="btn btn--danger btn--sm" disabled={!running.length} onClick={() => void act(() => runtime.rpc("tasks.cancel_all"), "Tarefas canceladas")}>
          Cancelar tudo
        </button>
      </div>
      {tasks.length === 0 ? (
        <Empty title="Nenhuma tarefa ainda">Tarefas compostas aparecem aqui com cada etapa. Ex.: “Abra meu projeto BETA e coloque ele para rodar.”</Empty>
      ) : (
        <ul className="items scroll">
          {tasks.map((t) => (
            <li key={t.id} className="item">
              <TaskProgress task={t} compact={t.steps.length <= 1} />
              <div className="item__meta">
                <span className={`chip ${t.status === "failed" ? "chip--danger" : t.status === "completed" ? "chip--ok" : t.status === "running" ? "chip--live" : ""}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                <span className="t-xs t-muted">{when(t.createdAt)}</span>
                <span className="t-xs t-muted">via {t.source === "voice" ? "voz" : t.source === "ui" ? "interface" : "texto"}</span>
              </div>
              {t.result && t.status === "completed" && <p className="t-xs t-muted">{t.result}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

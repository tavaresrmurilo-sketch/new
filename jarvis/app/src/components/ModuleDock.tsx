import { LEFT_MODULES, ModuleId, RIGHT_MODULES, useStore } from "../state/store";

export const MODULE_LABEL: Record<ModuleId, string> = {
  memory: "Memória",
  notes: "Notas",
  reminders: "Lembretes",
  tasks: "Tarefas",
  terminal: "Terminal",
  activity: "Atividade",
  privacy: "Privacidade",
  settings: "Configurações",
};

export const MODULE_KEYS: ModuleId[] = [...LEFT_MODULES, ...RIGHT_MODULES];

/** Module keys along the bottom corners. Alt+1…8 opens them from anywhere. */
export function ModuleDock({ side }: { side: "left" | "right" }) {
  const current = useStore((s) => s.module);
  const open = useStore((s) => s.openModule);
  const reminders = useStore((s) => s.revisions.reminders);
  const running = useStore((s) => Object.values(s.tasks).filter((t) => t.status === "running").length);
  const termRunning = useStore((s) => Object.values(s.terminal).filter((p) => p.status === "running").length);
  const mods = side === "left" ? LEFT_MODULES : RIGHT_MODULES;
  void reminders;
  return (
    <nav className={`dock dock--${side}`} aria-label={side === "left" ? "Módulos de dados" : "Módulos de sistema"}>
      {mods.map((m) => {
        const idx = MODULE_KEYS.indexOf(m) + 1;
        const badge = m === "tasks" && running ? running : m === "terminal" && termRunning ? termRunning : 0;
        return (
          <button
            key={m}
            type="button"
            className={`dock__key${current === m ? " is-active" : ""}`}
            aria-pressed={current === m}
            onClick={() => open(current === m ? null : m)}
            title={`${MODULE_LABEL[m]} (Alt+${idx})`}
          >
            <span className="t-label dock__label">{MODULE_LABEL[m]}</span>
            {badge > 0 && <span className="dock__badge t-num" aria-label={`${badge} em execução`}>{badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}

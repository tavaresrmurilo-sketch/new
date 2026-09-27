import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { LEFT_MODULES, ModuleId, useStore } from "../state/store";
import { IconClose } from "./icons";
import { ActivityPanel } from "./modules/ActivityPanel";
import { MemoryPanel } from "./modules/MemoryPanel";
import { NotesPanel } from "./modules/NotesPanel";
import { PrivacyCenter } from "./modules/PrivacyCenter";
import { RemindersPanel } from "./modules/RemindersPanel";
import { SettingsPanel } from "./modules/SettingsPanel";
import { TasksPanel } from "./modules/TasksPanel";
import { TerminalPanel } from "./modules/TerminalPanel";
import { MODULE_LABEL } from "./ModuleDock";

const PANELS: Record<ModuleId, () => React.ReactElement> = {
  memory: MemoryPanel,
  notes: NotesPanel,
  reminders: RemindersPanel,
  tasks: TasksPanel,
  terminal: TerminalPanel,
  activity: ActivityPanel,
  privacy: PrivacyCenter,
  settings: SettingsPanel,
};

/** A module slides over its side's instrument rail; the core stays visible. */
export function ModuleSheet() {
  const module = useStore((s) => s.module);
  const close = useStore((s) => s.openModule);
  const ref = useRef<HTMLElement>(null);
  const side = module && LEFT_MODULES.includes(module) ? "left" : "right";

  useEffect(() => {
    if (!module) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, [module]);

  const Panel = module ? PANELS[module] : null;
  return (
    <AnimatePresence>
      {module && Panel && (
        <motion.aside
          key={module}
          ref={ref}
          className={`sheet sheet--${side}`}
          role="dialog"
          aria-label={MODULE_LABEL[module]}
          tabIndex={-1}
          initial={{ opacity: 0, x: side === "left" ? -24 : 24, filter: "blur(6px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: side === "left" ? -16 : 16, filter: "blur(4px)", transition: { duration: 0.14 } }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              close(null);
            }
          }}
        >
          <header className="sheet__head">
            <h2 className="t-mark sheet__title">{MODULE_LABEL[module]}</h2>
            <button type="button" className="btn btn--ghost btn--icon" onClick={() => close(null)} aria-label={`Fechar ${MODULE_LABEL[module]}`}>
              <IconClose size={16} />
            </button>
          </header>
          <div className="sheet__body scroll">
            <Panel />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useStore } from "../state/store";
import { IconClose } from "./icons";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="toasts" role="region" aria-label="Avisos" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast--${t.kind}`}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
          >
            <div className="toast__body">
              <div className="toast__title">{t.title}</div>
              {t.body && <div className="t-sm t-muted">{t.body}</div>}
              {t.detail && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(open === t.id ? null : t.id)}>
                  {open === t.id ? "Ocultar detalhes" : "Detalhes"}
                </button>
              )}
              {open === t.id && <pre className="line__detail selectable">{t.detail}</pre>}
            </div>
            <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
              <IconClose size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

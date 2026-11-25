import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { runtime } from "../runtime";
import { useStore } from "../state/store";
import { IconShield } from "./icons";

const LEVEL_CLASS = ["", "", "perm--important", "perm--danger"];

const ARG_LABEL: Record<string, string> = {
  paths: "Itens", path: "Caminho", permanent: "Apagar permanentemente", name: "Nome", new_name: "Novo nome",
  destination: "Destino", folder: "Pasta", command: "Comando", project: "Projeto", script: "Script", force: "Forçar",
  pid: "PID", restart: "Reiniciar", delay_seconds: "Atraso (s)", question: "Pergunta", enabled: "Ativar",
  query: "Consulta", text: "Texto", title: "Título", window: "Janela", element: "Elemento", state: "Estado",
};

function show(v: unknown): string {
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.join("\n");
  return String(v);
}

/** Explicit confirmation for level 2/3 actions. Voice "sim"/"não" ("confirmo" for level 3) also answers it. */
export function PermissionDialog() {
  const permissions = useStore((s) => s.permissions);
  const req = permissions[0];
  const denyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!req) return;
    // Destructive actions focus "Cancelar" by default so Enter never destroys by accident.
    denyRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.id]);

  const answer = (approved: boolean) => {
    if (!req) return;
    runtime.client.send({ type: "permission.respond", id: req.id, approved });
    useStore.setState((s) => ({ permissions: s.permissions.filter((p) => p.id !== req.id) }));
  };

  const args = req ? Object.entries(req.args).filter(([, v]) => v !== "" && v !== null && v !== undefined) : [];

  return (
    <AnimatePresence>
      {req && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          <motion.div
            className={`modal perm ${LEVEL_CLASS[req.level] ?? ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="perm-title"
            aria-describedby="perm-desc"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 36 }}
          >
            <div className="perm__head">
              <IconShield size={18} />
              <span className="t-label">Nível {req.level} · {req.levelLabel}</span>
              {permissions.length > 1 && <span className="t-xs t-muted">+{permissions.length - 1} na fila</span>}
            </div>
            <h2 id="perm-title" className="perm__title">{req.summary}</h2>
            <p id="perm-desc" className="t-sm t-muted">
              {req.level >= 3 ? "Essa ação é destrutiva ou sensível. Confirme apenas se tiver certeza." : "Essa ação altera o seu computador. Deseja continuar?"} Você também pode responder por voz: {req.level >= 3 ? "“confirmo” ou “não”" : "“sim” ou “não”"}.
            </p>
            {args.length > 0 && (
              <dl className="perm__args selectable">
                {args.map(([k, v]) => (
                  <div key={k} className="perm__arg">
                    <dt className="t-xs t-muted">{ARG_LABEL[k] ?? req.labels?.[k] ?? k}</dt>
                    <dd className="t-sm">{show(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="modal__actions">
              <button ref={denyRef} type="button" className="btn" onClick={() => answer(false)}>
                Cancelar
              </button>
              <button type="button" className={`btn ${req.level >= 3 ? "btn--danger" : "btn--primary"}`} onClick={() => answer(true)}>
                {req.level >= 3 ? "Confirmar mesmo assim" : "Permitir"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

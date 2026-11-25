import { useState } from "react";
import { act, useRpc } from "../../hooks";
import type { Reminder } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { IconTrash } from "../icons";
import { Empty } from "../primitives";

export function RemindersPanel() {
  const rev = useStore((s) => s.revisions.reminders);
  const [status, setStatus] = useState<"pending" | "done">("pending");
  const [text, setText] = useState("");
  const { data, error, loading, reload } = useRpc<Reminder[]>("reminders.list", { status }, [status, rev]);

  const create = async () => {
    const r = await act(() => runtime.rpc<Reminder>("reminders.create", { text }));
    if (r) {
      useStore.getState().toast({ kind: "success", title: "Lembrete criado", body: `${r.text} — ${r.when}` });
      setText("");
      reload();
    }
  };

  return (
    <div className="module">
      <form className="module__toolbar" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <input className="input" placeholder="Ex.: amanhã às 15h ligar para o João" value={text} onChange={(e) => setText(e.target.value)} aria-label="Novo lembrete em linguagem natural" maxLength={500} />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!text.trim()}>Criar</button>
      </form>
      <p className="t-xs t-muted">Entende “daqui a 20 minutos”, “sexta às 9h”, “todo sábado às 10h”, “a cada 2 horas”.</p>
      <div className="chips" role="tablist" aria-label="Estado dos lembretes">
        <button type="button" role="tab" className="chip" aria-pressed={status === "pending"} aria-selected={status === "pending"} onClick={() => setStatus("pending")}>Pendentes</button>
        <button type="button" role="tab" className="chip" aria-pressed={status === "done"} aria-selected={status === "done"} onClick={() => setStatus("done")}>Concluídos</button>
      </div>
      {error && <p className="notice notice--error t-sm">{error}</p>}
      {!loading && data?.length === 0 ? (
        <Empty title={status === "pending" ? "Nenhum lembrete pendente" : "Nenhum lembrete concluído"}>Diga: “Jarvis, lembre-me amanhã às 15h de enviar o relatório.”</Empty>
      ) : (
        <ul className="items scroll">
          {(data ?? []).map((r) => (
            <li key={r.id} className="item">
              <p className="item__text">{r.text}</p>
              <div className="item__meta">
                <span className={`chip ${r.recurrence ? "chip--live" : ""}`}>{r.when}</span>
                <span className="grow" />
                {status === "pending" ? (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void act(() => runtime.rpc("reminders.cancel", { id: r.id }), "Lembrete cancelado").then(reload)}>Cancelar</button>
                ) : (
                  <button type="button" className="btn btn--ghost btn--icon btn--sm" aria-label="Remover do histórico" onClick={() => void act(() => runtime.rpc("reminders.delete", { id: r.id })).then(reload)}><IconTrash size={14} /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

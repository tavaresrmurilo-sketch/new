import { useMemo, useState } from "react";
import { act, useDebounced, useRpc } from "../../hooks";
import type { ActivityEntry } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { IconSearch } from "../icons";
import { Empty } from "../primitives";

const CATS = ["SYSTEM", "VOICE", "AI", "TOOLS", "TASKS", "ERROR", "SECURITY"];

export function ActivityPanel() {
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);
  const q = useDebounced(query);
  const { data, reload } = useRpc<ActivityEntry[]>("activity.list", { category, query: q, limit: 300 }, [category, q]);
  const live = useStore((s) => s.activity);
  const rows = useMemo(() => {
    const seen = new Set<number>();
    const out: ActivityEntry[] = [];
    const matches = (e: ActivityEntry) => (!category || e.category === category) && (!q || e.message.toLowerCase().includes(q.toLowerCase()));
    for (const e of [...live, ...(data ?? [])]) {
      if (seen.has(e.id) || !matches(e)) continue;
      seen.add(e.id);
      out.push(e);
    }
    return out.sort((a, b) => b.id - a.id).slice(0, 300);
  }, [live, data, category, q]);

  return (
    <div className="module">
      <p className="t-sm t-muted module__intro">Tudo o que o Jarvis fez, com categoria e horário. Chaves e tokens nunca aparecem aqui.</p>
      <div className="module__toolbar">
        <div className="search">
          <IconSearch size={14} />
          <input className="input input--bare" placeholder="Filtrar mensagens" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filtrar atividade" />
        </div>
        {confirm ? (
          <>
            <button type="button" className="btn btn--danger btn--sm" onClick={() => void act(() => runtime.rpc("activity.clear"), "Registro de atividade apagado").then(() => { setConfirm(false); useStore.setState({ activity: [] }); reload(); })}>Apagar tudo</button>
            <button type="button" className="btn btn--sm" onClick={() => setConfirm(false)}>Cancelar</button>
          </>
        ) : (
          <button type="button" className="btn btn--sm" onClick={() => setConfirm(true)}>Limpar</button>
        )}
      </div>
      <div className="chips" role="group" aria-label="Filtrar por categoria">
        <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>Todas</button>
        {CATS.map((c) => (
          <button key={c} type="button" className={`chip${c === "ERROR" ? " chip--cat-error" : c === "SECURITY" ? " chip--cat-sec" : ""}`} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</button>
        ))}
      </div>
      {rows.length === 0 ? (
        <Empty title="Sem registros">Nada corresponde ao filtro.</Empty>
      ) : (
        <ol className="log scroll">
          {rows.map((e) => {
            const hasData = e.data && Object.keys(e.data).length > 0;
            return (
              <li key={e.id} className={`log__row log__row--${e.level}`}>
                <span className="t-num t-xs t-muted log__time">{new Date(e.ts * 1000).toLocaleTimeString("pt-BR")}</span>
                <span className={`log__cat log__cat--${e.category.toLowerCase()}`}>{e.category}</span>
                <span className="log__msg selectable">{e.message}</span>
                {hasData && (
                  <button type="button" className="btn btn--ghost btn--sm log__more" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                    {open === e.id ? "menos" : "detalhes"}
                  </button>
                )}
                {open === e.id && <pre className="log__data selectable">{JSON.stringify(e.data, null, 2)}</pre>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

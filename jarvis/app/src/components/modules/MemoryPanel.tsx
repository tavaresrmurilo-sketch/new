import { useState } from "react";
import { act, useDebounced, useRpc } from "../../hooks";
import { CATEGORY_LABEL, when } from "../../lib/format";
import type { Memory } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "../icons";
import { Empty } from "../primitives";

const CATS = ["fact", "preference", "project", "task", "person", "other"];

function MemoryItem({ m, onChanged }: { m: Memory; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [content, setContent] = useState(m.content);
  const [category, setCategory] = useState(m.category);
  const save = async () => {
    if (await act(() => runtime.rpc("memory.update", { id: m.id, content, category }), "Memória atualizada")) {
      setEditing(false);
      onChanged();
    }
  };
  return (
    <li className="item">
      {editing ? (
        <div className="item__edit">
          <textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} aria-label="Conteúdo da memória" maxLength={2000} />
          <div className="row">
            <select className="select select--sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
              {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <span className="grow" />
            <button type="button" className="btn btn--sm" onClick={() => setEditing(false)}>Cancelar</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void save()} disabled={!content.trim()}>Salvar</button>
          </div>
        </div>
      ) : (
        <>
          <p className="item__text selectable">{m.content}</p>
          <div className="item__meta">
            <span className="chip">{CATEGORY_LABEL[m.category] ?? m.category}</span>
            <span className="t-xs t-muted">{when(m.created_at)}</span>
            <span className="t-xs t-muted">origem: {m.source === "voice" ? "voz" : m.source === "text" ? "texto" : "manual"}</span>
            <span className="grow" />
            {confirm ? (
              <>
                <span className="t-xs">Apagar?</span>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => void act(() => runtime.rpc("memory.delete", { id: m.id }), "Memória apagada").then(onChanged)}>Sim</button>
                <button type="button" className="btn btn--sm" onClick={() => setConfirm(false)}>Não</button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => setEditing(true)} aria-label="Editar memória"><IconEdit size={14} /></button>
                <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={() => setConfirm(true)} aria-label="Apagar memória"><IconTrash size={14} /></button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export function MemoryPanel() {
  const rev = useStore((s) => s.revisions.memory);
  const enabled = useStore((s) => s.settings?.privacy.memory_enabled ?? true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCat, setDraftCat] = useState("fact");
  const q = useDebounced(query);
  const { data, error, loading, reload } = useRpc<Memory[]>("memory.list", { query: q, category }, [q, category, rev]);

  const add = async () => {
    if (await act(() => runtime.rpc("memory.create", { content: draft, category: draftCat }), "Memória salva")) {
      setDraft("");
      setAdding(false);
      reload();
    }
  };

  return (
    <div className="module">
      <p className="t-sm t-muted module__intro">
        Só o que você pediu explicitamente (“Jarvis, lembre que…”) é guardado. Diga “esqueça…” para apagar.
      </p>
      {!enabled && <p className="notice notice--warn t-sm">A memória de longo prazo está desativada em Privacidade. Nada novo será salvo.</p>}
      <div className="module__toolbar">
        <div className="search">
          <IconSearch size={14} />
          <input className="input input--bare" placeholder="Pesquisar memórias" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Pesquisar memórias" />
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding} disabled={!enabled}>
          <IconPlus size={14} /> Nova
        </button>
      </div>
      <div className="chips" role="group" aria-label="Filtrar por categoria">
        <button type="button" className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>Todas</button>
        {CATS.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {adding && (
        <div className="item item--form">
          <textarea className="textarea" placeholder="Ex.: Meu projeto BETA usa Node 22 e pnpm." value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Nova memória" maxLength={2000} autoFocus />
          <div className="row">
            <select className="select select--sm" value={draftCat} onChange={(e) => setDraftCat(e.target.value)} aria-label="Categoria da nova memória">
              {CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <span className="grow" />
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void add()} disabled={!draft.trim()}>Salvar memória</button>
          </div>
        </div>
      )}
      {error && <p className="notice notice--error t-sm">{error}</p>}
      {!loading && data && data.length === 0 ? (
        <Empty title={q || category ? "Nada encontrado" : "Nenhuma memória ainda"}>
          {q || category ? "Tente outros termos." : "Diga: “Jarvis, lembre que eu prefiro respostas curtas.”"}
        </Empty>
      ) : (
        <ul className="items scroll">
          {(data ?? []).map((m) => <MemoryItem key={`${m.id}-${m.updated_at}`} m={m} onChanged={reload} />)}
        </ul>
      )}
    </div>
  );
}

import { useState } from "react";
import { act, useDebounced, useRpc } from "../../hooks";
import { when } from "../../lib/format";
import type { Note } from "../../lib/types";
import { runtime } from "../../runtime";
import { useStore } from "../../state/store";
import { IconPlus, IconSearch, IconTrash } from "../icons";
import { Empty } from "../primitives";

function Editor({ note, onDone }: { note: Note | null; onDone: () => void }) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    const ok = note
      ? await act(() => runtime.rpc("notes.update", { id: note.id, title, content }), "Nota salva")
      : await act(() => runtime.rpc("notes.create", { title, content }), "Nota criada");
    if (ok) onDone();
  };
  return (
    <div className="editor">
      <input className="input editor__title" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Título da nota" maxLength={200} autoFocus={!note} />
      <textarea className="textarea editor__body" placeholder="Escreva aqui…" value={content} onChange={(e) => setContent(e.target.value)} aria-label="Conteúdo da nota" />
      <div className="row">
        {note &&
          (confirm ? (
            <>
              <span className="t-xs">Apagar esta nota?</span>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => void act(() => runtime.rpc("notes.delete", { id: note.id }), "Nota apagada").then(onDone)}>Apagar</button>
              <button type="button" className="btn btn--sm" onClick={() => setConfirm(false)}>Manter</button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirm(true)}><IconTrash size={14} /> Apagar</button>
          ))}
        <span className="grow" />
        <button type="button" className="btn btn--sm" onClick={onDone}>Voltar</button>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => void save()} disabled={!content.trim() && !title.trim()}>Salvar</button>
      </div>
    </div>
  );
}

export function NotesPanel() {
  const rev = useStore((s) => s.revisions.notes);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Note | "new" | null>(null);
  const q = useDebounced(query);
  const { data, error, loading, reload } = useRpc<Note[]>("notes.list", { query: q }, [q, rev]);

  if (open) {
    return (
      <div className="module">
        <Editor note={open === "new" ? null : open} onDone={() => { setOpen(null); reload(); }} />
      </div>
    );
  }
  return (
    <div className="module">
      <div className="module__toolbar">
        <div className="search">
          <IconSearch size={14} />
          <input className="input input--bare" placeholder="Pesquisar notas" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Pesquisar notas" />
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setOpen("new")}><IconPlus size={14} /> Nova nota</button>
      </div>
      {error && <p className="notice notice--error t-sm">{error}</p>}
      {!loading && data?.length === 0 ? (
        <Empty title={q ? "Nenhuma nota encontrada" : "Nenhuma nota"}>{q ? "Tente outros termos." : "Diga: “Jarvis, anote que preciso terminar o projeto amanhã.”"}</Empty>
      ) : (
        <ul className="items scroll">
          {(data ?? []).map((n) => (
            <li key={n.id} className="item item--click">
              <button type="button" className="item__button" onClick={() => setOpen(n)}>
                <span className="item__title">{n.title || "Sem título"}</span>
                <span className="t-sm t-muted item__preview">{(n.snippet || n.content).slice(0, 160)}</span>
                <span className="t-xs t-dim">{when(n.updated_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

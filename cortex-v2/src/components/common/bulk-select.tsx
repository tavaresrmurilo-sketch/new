"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Checkbox } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";

interface BulkCtx {
  selected: Set<string>;
  toggle: (id: string) => void;
  setAll: (ids: string[], on: boolean) => void;
  clear: () => void;
  ids: string[];
}

const Ctx = React.createContext<BulkCtx | null>(null);

/** Seleção múltipla em tabelas renderizadas no servidor. */
export function BulkSelectProvider({ ids, children }: { ids: string[]; children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setSelected((s) => new Set([...s].filter((id) => ids.includes(id)))), [ids]);
  const value = React.useMemo<BulkCtx>(
    () => ({
      selected,
      ids,
      toggle: (id) => setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
      setAll: (list, on) => setSelected(on ? new Set(list) : new Set()),
      clear: () => setSelected(new Set()),
    }),
    [selected, ids],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBulk() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useBulk fora do provider");
  return c;
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useBulk();
  return <Checkbox checked={selected.has(id)} onCheckedChange={() => toggle(id)} aria-label={`Selecionar ${label}`} />;
}

export function SelectAllCheckbox() {
  const { selected, ids, setAll } = useBulk();
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = selected.size > 0 && !all;
  return <Checkbox checked={all ? true : some ? "indeterminate" : false} onCheckedChange={(v) => setAll(ids, v === true)} aria-label="Selecionar todos" />;
}

export function BulkActionBar({ children }: { children: (ids: string[], clear: () => void) => React.ReactNode }) {
  const { selected, clear } = useBulk();
  if (!selected.size) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-xl" role="toolbar" aria-label="Ações em lote">
      <span className="text-sm font-medium tabular">{selected.size} selecionado(s)</span>
      {children([...selected], clear)}
      <Button variant="ghost" size="icon-xs" onClick={clear} aria-label="Limpar seleção">
        <X />
      </Button>
    </div>
  );
}

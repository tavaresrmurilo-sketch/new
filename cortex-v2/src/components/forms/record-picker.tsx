"use client";

import * as React from "react";
import { Command as Cmdk } from "cmdk";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inputClass } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";
import { searchRecordsAction } from "@/features/shared/actions";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; subtitle?: string | null };

/** Combobox com busca assíncrona no servidor (escala para milhares de registros). */
export function RecordPicker({
  type,
  value,
  label,
  onChange,
  placeholder = "Selecionar…",
  disabled,
  id,
  invalid,
  allowClear = true,
}: {
  type: "client" | "opportunity" | "project" | "contact" | "lead" | "proposal" | "contract";
  value: string | null | undefined;
  label?: string | null;
  onChange: (id: string | null, item: Item | null) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  allowClear?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedLabel, setSelectedLabel] = React.useState<string | null>(label ?? null);
  const debounced = useDebounce(query, 200);

  React.useEffect(() => setSelectedLabel(label ?? null), [label]);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    // busca vazia: retorna os mais recentes via termo curinga mínimo
    const q = debounced.trim();
    void searchRecordsAction({ q: q.length >= 2 ? q : "", types: [type], limit: 10 }).then((r) => {
      if (!alive) return;
      setItems(r.ok ? r.data.map((x) => ({ id: x.id, title: x.title, subtitle: x.subtitle })) : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [debounced, open, type]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          data-invalid={invalid || undefined}
          aria-haspopup="listbox"
          className={cn(inputClass, "items-center justify-between gap-2 text-left", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value ? (selectedLabel ?? "Selecionado") : placeholder}</span>
          <span className="flex items-center gap-1">
            {value && allowClear ? (
              <X
                className="size-3.5 text-muted-foreground hover:text-foreground"
                aria-label="Limpar"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedLabel(null);
                  onChange(null, null);
                }}
              />
            ) : null}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Cmdk shouldFilter={false}>
          <div className="border-b px-2">
            <Cmdk.Input value={query} onValueChange={setQuery} placeholder="Digite para buscar…" className="h-9 w-full bg-transparent text-sm outline-none" autoFocus />
          </div>
          <Cmdk.List className="max-h-64 overflow-y-auto p-1">
            {loading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : (
              <Cmdk.Empty className="py-6 text-center text-xs text-muted-foreground">{query.length < 2 ? "Digite ao menos 2 letras." : "Nenhum resultado."}</Cmdk.Empty>
            )}
            {!loading &&
              items.map((item) => (
                <Cmdk.Item
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    setSelectedLabel(item.title);
                    onChange(item.id, item);
                    setOpen(false);
                  }}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-accent"
                >
                  <Check className={cn("size-3.5", value === item.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{item.title}</span>
                  {item.subtitle ? <span className="ml-auto truncate text-xs text-muted-foreground">{item.subtitle}</span> : null}
                </Cmdk.Item>
              ))}
          </Cmdk.List>
        </Cmdk>
      </PopoverContent>
    </Popover>
  );
}

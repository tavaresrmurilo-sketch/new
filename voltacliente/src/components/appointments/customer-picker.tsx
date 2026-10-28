"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckIcon, LoaderCircleIcon, SearchIcon, UserPlusIcon, XIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchCustomersAction } from "@/modules/customers/actions";

export type PickedCustomer = { id: string; name: string; phone: string };

/** Seleção de cliente com busca instantânea no servidor. */
export function CustomerPicker({
  value,
  onChange,
  locked,
  invalid,
}: {
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer | null) => void;
  locked?: boolean;
  invalid?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function search(text: string) {
    setQuery(text);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++request.current;
    timer.current = setTimeout(async () => {
      const result = await searchCustomersAction(text);
      if (id !== request.current) return;
      setLoading(false);
      setResults(result.ok ? result.data : []);
      setActive(0);
    }, 200);
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
        <Avatar name={value.name} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{value.phone}</p>
        </div>
        {!locked && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Trocar cliente"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id="customer"
        role="combobox"
        aria-expanded={open}
        aria-controls="customer-results"
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Buscar cliente por nome ou telefone"
        value={query}
        onChange={(e) => search(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && results[active]) {
            e.preventDefault();
            onChange(results[active]);
          }
        }}
        className="pl-9"
      />
      {loading && <LoaderCircleIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {open && query.trim().length >= 2 && (
        <ul
          id="customer-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-lg"
        >
          {results.map((customer, index) => (
            <li key={customer.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(customer)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                  index === active && "bg-accent",
                )}
              >
                <Avatar name={customer.name} className="size-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{customer.name}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">{customer.phone}</span>
                </span>
                {index === active && <CheckIcon className="size-4 text-muted-foreground" />}
              </button>
            </li>
          ))}
          {!loading && results.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum cliente encontrado.</li>}
          <li className="border-t pt-1">
            <Link
              href="/clientes/novo"
              className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-primary hover:bg-accent"
            >
              <UserPlusIcon className="size-4" /> Cadastrar novo cliente
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

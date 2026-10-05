"use client";

import * as React from "react";
import { X } from "lucide-react";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Campo de tags com autocomplete das tags existentes no workspace. Enter ou vírgula adiciona. */
export function TagInput({ value, onChange, suggestions = [], id, placeholder = "Adicionar tag…" }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; id?: string; placeholder?: string }) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId();
  const add = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").slice(0, 40);
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase()) || value.length >= 20) return;
    onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className={cn(inputClass, "h-auto min-h-9 flex-wrap items-center gap-1 py-1")}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">
          {tag}
          <button type="button" aria-label={`Remover tag ${tag}`} onClick={() => onChange(value.filter((v) => v !== tag))}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={draft}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) add(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        className="min-w-[90px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).slice(0, 50).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

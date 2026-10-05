"use client";

import * as React from "react";
import { UserAvatar } from "@/components/common/user-avatar";
import { cn } from "@/lib/utils";

/** Seleção múltipla de pessoas (lista com checkboxes, acessível por teclado). */
export function MemberMultiSelect({ members, value, onChange, id, emptyText = "Nenhuma pessoa disponível." }: { members: { id: string; name: string; hint?: string | null }[]; value: string[]; onChange: (v: string[]) => void; id?: string; emptyText?: string }) {
  if (!members.length) return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <div id={id} role="group" className="max-h-40 overflow-y-auto rounded-md border p-1">
      {members.map((m) => {
        const checked = value.includes(m.id);
        return (
          <label key={m.id} className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/60", checked && "bg-primary/5")}>
            <input type="checkbox" className="size-4" checked={checked} onChange={(e) => onChange(e.target.checked ? [...value, m.id] : value.filter((v) => v !== m.id))} />
            <UserAvatar name={m.name} size="xs" />
            <span className="truncate">{m.name}</span>
            {m.hint ? <span className="ml-auto truncate text-xs text-muted-foreground">{m.hint}</span> : null}
          </label>
        );
      })}
    </div>
  );
}

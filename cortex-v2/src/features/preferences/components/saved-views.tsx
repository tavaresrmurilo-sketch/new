"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, BookmarkPlus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import { deleteViewAction, saveViewAction } from "../actions";

type View = { id: string; name: string; query: string; shared: boolean; mine: boolean };
type Entity = "clients" | "leads" | "opportunities" | "projects" | "tasks" | "proposals" | "contracts" | "meetings" | "documents";

/** Saved Views: salva os filtros atuais da URL com um nome (ex.: “Clientes VIP”). */
export function SavedViews({ entity, views }: { entity: Entity; views: View[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = new URLSearchParams(params.toString());
  current.delete("page");
  const currentQuery = current.toString();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const save = useAction(saveViewAction, { success: "Visão salva", onSuccess: () => { setOpen(false); setName(""); } });
  const del = useAction(deleteViewAction, { success: "Visão removida" });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button variant={!currentQuery ? "secondary" : "ghost"} size="xs" onClick={() => router.push(pathname)}>
        Todos
      </Button>
      {views.map((v) => (
        <span key={v.id} className="group inline-flex items-center">
          <Button variant={currentQuery === v.query ? "secondary" : "ghost"} size="xs" onClick={() => router.push(`${pathname}?${v.query}`)}>
            {v.shared ? <Users /> : <Bookmark />} {v.name}
          </Button>
          {v.mine ? (
            <button type="button" className={cn("hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:inline-flex")} aria-label={`Remover visão ${v.name}`} onClick={() => void del.run({ id: v.id })}>
              <Trash2 className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="xs" disabled={!currentQuery} title={currentQuery ? "Salvar filtros atuais" : "Aplique filtros para salvar uma visão"}>
            <BookmarkPlus /> Salvar visão
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Nome da visão</Label>
            <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Minhas propostas acima de R$ 20 mil" autoFocus />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="size-4" /> Compartilhar com a equipe
          </label>
          <Button size="sm" className="w-full" loading={save.pending} disabled={name.trim().length < 2} onClick={() => void save.run({ entity, name, query: currentQuery, isShared: shared })}>
            Salvar
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

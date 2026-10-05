"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PriorityBadge } from "@/components/common/badges";
import { UserAvatar } from "@/components/common/user-avatar";
import { Checkbox } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { formatShortDate } from "@/lib/format";
import { TASK_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { quickTaskAction, setTaskStatusAction } from "../actions";

export interface ChecklistTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  subtasks?: number;
}

/** Lista de tarefas com conclusão em um clique e criação rápida (projetos, subtarefas). */
export function TaskChecklist({ tasks, todayKey, canWrite, quickAdd }: { tasks: ChecklistTask[]; todayKey: string; canWrite: boolean; quickAdd?: { projectId?: string; parentId?: string; opportunityId?: string; clientId?: string } }) {
  const [title, setTitle] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const toggle = useAction(setTaskStatusAction);
  const add = useAction(quickTaskAction, { onSuccess: () => { setTitle(""); setDueDate(""); toast.success("Tarefa criada"); } });
  const open = tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELED");
  const done = tasks.filter((t) => t.status === "DONE");
  const row = (t: ChecklistTask) => {
    const overdue = t.status !== "DONE" && t.dueDate && t.dueDate < todayKey;
    return (
      <li key={t.id} className="flex items-center gap-3 px-3 py-2">
        <Checkbox
          checked={t.status === "DONE"}
          disabled={!canWrite || toggle.pending}
          onCheckedChange={(v) => void toggle.run({ id: t.id, status: v === true ? "DONE" : "TODO" })}
          aria-label={t.status === "DONE" ? `Reabrir ${t.title}` : `Concluir ${t.title}`}
        />
        <Link href={`/app/tasks/${t.id}`} className={cn("min-w-0 flex-1 truncate text-sm hover:underline", t.status === "DONE" && "text-muted-foreground line-through")}>
          {t.title}
          {t.subtasks ? <span className="ml-1.5 text-xs text-muted-foreground">({t.subtasks} subtarefas)</span> : null}
        </Link>
        {t.status === "BLOCKED" || t.status === "IN_PROGRESS" ? <span className="text-xs text-muted-foreground">{TASK_STATUS[t.status]?.label}</span> : null}
        {t.status !== "DONE" ? <PriorityBadge priority={t.priority} /> : null}
        {t.dueDate ? <span className={cn("tabular w-14 text-right text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{formatShortDate(t.dueDate)}</span> : <span className="w-14" />}
        {t.assigneeName ? <UserAvatar name={t.assigneeName} size="xs" /> : <span className="size-5" />}
      </li>
    );
  };
  return (
    <div className="space-y-3">
      {canWrite && quickAdd ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 2) return;
            void add.run({ title, dueDate: dueDate || null, ...quickAdd });
          }}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Adicionar tarefa…" aria-label="Título da nova tarefa" className="h-8" />
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Prazo" className="h-8 w-40" />
          <Button size="sm" type="submit" loading={add.pending} disabled={title.trim().length < 2}>
            <Plus /> Adicionar
          </Button>
        </form>
      ) : null}
      {tasks.length ? (
        <ul className="divide-y rounded-lg border bg-card">
          {open.map(row)}
          {done.length ? <li className="bg-subtle/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">Concluídas ({done.length})</li> : null}
          {done.map(row)}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma tarefa ainda.</p>
      )}
    </div>
  );
}

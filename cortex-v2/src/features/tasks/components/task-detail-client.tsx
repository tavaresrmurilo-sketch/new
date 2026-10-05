"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Send, Trash2 } from "lucide-react";
import { DeleteButton } from "@/components/common/delete-button";
import { EntityDialog } from "@/components/common/entity-dialog";
import { UserAvatar } from "@/components/common/user-avatar";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { formatRelativeTime } from "@/lib/format";
import { TASK_STATUS } from "@/lib/labels";
import { addCommentAction, deleteCommentAction, deleteTaskAction, setTaskStatusAction } from "../actions";
import type { TaskInput } from "../schemas";
import { TaskForm } from "./task-form";

export function TaskStatusSelect({ id, status, disabled }: { id: string; status: string; disabled?: boolean }) {
  const { run, pending } = useAction(setTaskStatusAction, { success: "Status atualizado" });
  return (
    <NativeSelect aria-label="Status da tarefa" value={status} disabled={disabled || pending} onChange={(e) => void run({ id, status: e.target.value as "TODO" })} className="h-8 w-44 text-[13px]">
      {Object.entries(TASK_STATUS).map(([k, v]) => (
        <option key={k} value={k}>
          {v.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function TaskHeaderActions({ id, values, labels, canWrite, canDelete }: { id: string; values: Partial<TaskInput>; labels: { client: string | null; opportunity: string | null }; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter();
  return (
    <>
      {canWrite ? (
        <EntityDialog title="Editar tarefa" trigger={<Button size="sm" variant="outline"><Pencil /> Editar</Button>}>
          {(close) => (
            <TaskForm
              id={id}
              defaultValues={values}
              clientLabel={labels.client}
              opportunityLabel={labels.opportunity}
              onCancel={close}
              onDone={() => {
                close();
                router.refresh();
              }}
            />
          )}
        </EntityDialog>
      ) : null}
      {canDelete ? <DeleteButton action={deleteTaskAction} id={id} label="tarefa" redirectTo="/app/tasks" /> : null}
    </>
  );
}

export function CommentsPanel({ taskId, comments, currentUserId, canComment, canModerate, members }: { taskId: string; comments: { id: string; body: string; createdAt: Date | string; author: { id: string; name: string } }[]; currentUserId: string; canComment: boolean; canModerate: boolean; members: string[] }) {
  const [body, setBody] = React.useState("");
  const add = useAction(addCommentAction, { onSuccess: () => setBody("") });
  const del = useAction(deleteCommentAction, { success: "Comentário removido" });
  const mention = (name: string) => setBody((b) => `${b}${b.endsWith(" ") || !b ? "" : " "}@${name} `);
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="group flex gap-2.5">
            <UserAvatar name={c.author.name} size="sm" />
            <div className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2">
              <p className="text-xs">
                <span className="font-medium">{c.author.name}</span> <span className="text-muted-foreground">· {formatRelativeTime(c.createdAt)}</span>
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{c.body}</p>
            </div>
            {c.author.id === currentUserId || canModerate ? (
              <Button size="icon-xs" variant="ghost" className="opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="Excluir comentário" onClick={() => void del.run({ id: c.id })}>
                <Trash2 />
              </Button>
            ) : null}
          </li>
        ))}
        {!comments.length ? <li className="text-sm text-muted-foreground">Nenhum comentário ainda.</li> : null}
      </ul>
      {canComment ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) void add.run({ taskId, body });
          }}
        >
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva um comentário… use @Nome para mencionar alguém" aria-label="Novo comentário" />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Mencionar:</span>
            {members.slice(0, 8).map((m) => (
              <button key={m} type="button" onClick={() => mention(m)} className="rounded bg-muted px-1.5 py-0.5 text-[11px] hover:bg-accent">
                @{m.split(" ")[0]}
              </button>
            ))}
            <Button type="submit" size="sm" className="ml-auto" loading={add.pending} disabled={!body.trim()}>
              <Send /> Comentar
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

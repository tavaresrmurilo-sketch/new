"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, closestCorners, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { PriorityBadge } from "@/components/common/badges";
import { UserAvatar } from "@/components/common/user-avatar";
import { formatShortDate } from "@/lib/format";
import { TASK_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { setTaskStatusAction } from "../actions";

export interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  context: string | null;
}

const COLUMNS = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;

function Item({ task, todayKey, disabled }: { task: BoardTask; todayKey: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({ id: task.id, disabled });
  const overdue = task.status !== "DONE" && task.dueDate && task.dueDate < todayKey;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn("touch-none space-y-1.5 rounded-md border bg-card p-2.5 shadow-sm", isDragging && "z-50 opacity-80 shadow-lg", !disabled && "cursor-grab")}
      aria-label={task.title}
    >
      <Link href={`/app/tasks/${task.id}`} className="line-clamp-2 text-[13px] font-medium hover:underline" onPointerDown={(e) => e.stopPropagation()}>
        {task.title}
      </Link>
      {task.context ? <p className="truncate text-xs text-muted-foreground">{task.context}</p> : null}
      <div className="flex items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.dueDate ? <span className={cn("text-[11px]", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>{formatShortDate(task.dueDate)}</span> : null}
        {task.assigneeName ? <UserAvatar name={task.assigneeName} size="xs" className="ml-auto" /> : null}
      </div>
    </div>
  );
}

function Col({ status, children, count }: { status: string; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={TASK_STATUS[status]?.label} className={cn("flex min-h-[300px] w-[280px] shrink-0 flex-col rounded-lg border bg-subtle/70 lg:w-auto lg:flex-1", isOver && "border-primary/50 bg-primary/5")}>
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-[13px] font-semibold">{TASK_STATUS[status]?.label}</h3>
        <span className="tabular rounded-full bg-background px-1.5 text-[11px] text-muted-foreground">{count}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
    </section>
  );
}

export function TaskBoard({ initial, todayKey, canWrite }: { initial: BoardTask[]; todayKey: string; canWrite: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = React.useState(initial);
  React.useEffect(() => setTasks(initial), [initial]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    const status = e.over ? String(e.over.id) : null;
    const task = tasks.find((t) => t.id === id);
    if (!task || !status || task.status === status) return;
    const prev = task.status;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t)));
    const r = await setTaskStatusAction({ id, status: status as (typeof COLUMNS)[number] });
    if (!r.ok) {
      toast.error(r.error);
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: prev } : t)));
    } else router.refresh();
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNS.map((c) => {
          const list = tasks.filter((t) => t.status === c);
          return (
            <Col key={c} status={c} count={list.length}>
              {list.map((t) => (
                <Item key={t.id} task={t} todayKey={todayKey} disabled={!canWrite} />
              ))}
            </Col>
          );
        })}
      </div>
    </DndContext>
  );
}

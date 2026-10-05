"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveX, Check, Circle, MailOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archiveNotificationsAction, markAllNotificationsReadAction, markNotificationAction } from "../actions";
import { cn } from "@/lib/utils";

export interface InboxItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  when: string;
}

export function InboxList({ items }: { items: InboxItem[] }) {
  const router = useRouter();
  const [list, setList] = React.useState(items);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setList(items), [items]);

  async function archive(ids: string[] | "all") {
    setBusy(true);
    const r = await archiveNotificationsAction(ids === "all" ? { all: true } : { ids });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setList((prev) => (ids === "all" ? [] : prev.filter((i) => !ids.includes(i.id))));
    router.refresh();
  }
  async function toggle(item: InboxItem) {
    setList((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: !i.read } : i)));
    await markNotificationAction({ id: item.id, read: !item.read });
  }

  if (!list.length) return null;
  const unread = list.filter((i) => !i.read).length;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {list.length} notificação(ões){unread ? ` · ${unread} não lida(s)` : ""}
        </p>
        <div className="flex gap-1.5">
          {unread ? (
            <Button
              size="xs"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setList((prev) => prev.map((i) => ({ ...i, read: true })));
                await markAllNotificationsReadAction({});
                router.refresh();
              }}
            >
              <MailOpen /> Marcar todas como lidas
            </Button>
          ) : null}
          <Button size="xs" variant="outline" disabled={busy} onClick={() => archive("all")}>
            <ArchiveX /> Arquivar todas
          </Button>
        </div>
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {list.map((n) => (
          <li key={n.id} className={cn("group flex items-start gap-3 px-4 py-3", !n.read && "bg-primary/[0.03]")}>
            <button type="button" onClick={() => toggle(n)} className="mt-1 shrink-0" aria-label={n.read ? "Marcar como não lida" : "Marcar como lida"} title={n.read ? "Marcar como não lida" : "Marcar como lida"}>
              <Circle className={cn("size-2.5", n.read ? "text-muted-foreground/40" : "fill-primary text-primary")} />
            </button>
            <div className="min-w-0 flex-1">
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => {
                    if (!n.read) void markNotificationAction({ id: n.id, read: true });
                  }}
                  className={cn("text-sm hover:underline", !n.read && "font-medium")}
                >
                  {n.title}
                </Link>
              ) : (
                <p className={cn("text-sm", !n.read && "font-medium")}>{n.title}</p>
              )}
              {n.body ? <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{n.body}</p> : null}
              <p className="mt-0.5 text-xs text-muted-foreground">{n.when}</p>
            </div>
            <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              {!n.read ? (
                <Button size="icon-xs" variant="ghost" aria-label="Marcar como lida" onClick={() => toggle(n)}>
                  <Check />
                </Button>
              ) : null}
              <Button size="icon-xs" variant="ghost" aria-label="Arquivar" disabled={busy} onClick={() => archive([n.id])}>
                <Archive />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

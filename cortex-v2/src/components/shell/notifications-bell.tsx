"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/misc";
import { listNotificationsAction, markAllNotificationsReadAction, markNotificationAction } from "@/features/notifications/actions";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: Date | null; createdAt: Date };

export function NotificationsBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Item[] | null>(null);
  const [unread, setUnread] = React.useState(initialUnread);

  React.useEffect(() => setUnread(initialUnread), [initialUnread]);

  const load = React.useCallback(async () => {
    const res = await listNotificationsAction({ limit: 20 });
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unread);
    }
  }, []);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function toggleRead(item: Item) {
    const read = !item.readAt;
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, readAt: read ? new Date() : null } : i)) ?? null);
    setUnread((u) => Math.max(0, u + (read ? -1 : 1)));
    await markNotificationAction({ id: item.id, read });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`} className="relative">
          <Bell />
          {unread > 0 ? (
            <span className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notificações</p>
          <Button
            variant="ghost"
            size="xs"
            disabled={!unread}
            onClick={async () => {
              await markAllNotificationsReadAction({});
              await load();
              router.refresh();
            }}
          >
            <CheckCheck /> Marcar todas como lidas
          </Button>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {items === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma notificação por aqui.</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className={cn("group flex gap-2 border-b px-3 py-2.5 last:border-0", !item.readAt && "bg-primary/[0.03]")}>
                  <button
                    type="button"
                    onClick={() => toggleRead(item)}
                    className="mt-1 shrink-0 rounded-full"
                    aria-label={item.readAt ? "Marcar como não lida" : "Marcar como lida"}
                    title={item.readAt ? "Marcar como não lida" : "Marcar como lida"}
                  >
                    <Circle className={cn("size-2.5", item.readAt ? "text-muted-foreground/40" : "fill-primary text-primary")} />
                  </button>
                  <div className="min-w-0 flex-1">
                    {item.link ? (
                      <Link
                        href={item.link}
                        className="text-[13px] font-medium leading-snug hover:underline"
                        onClick={() => {
                          setOpen(false);
                          if (!item.readAt) void markNotificationAction({ id: item.id, read: true });
                        }}
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <p className="text-[13px] font-medium leading-snug">{item.title}</p>
                    )}
                    {item.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p> : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(item.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t px-3 py-2 text-center">
          <Link href="/app/inbox" className="text-xs font-medium text-primary hover:underline" onClick={() => setOpen(false)}>
            Abrir Inbox
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

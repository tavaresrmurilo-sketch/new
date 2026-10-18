"use client";

import type { NotificationType } from "@prisma/client";
import { AlarmClock, BellRing, CalendarX, CheckCheck, CircleCheck, CircleX, Compass, CreditCard, Megaphone, PencilLine, Settings, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MobileHeader } from "@/components/layout/mobile-header";
import { Button } from "@/components/ui/button";
import { IllustratedEmpty } from "@/components/me/empty-illustration";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { loadMoreNotificationsAction, markAllNotificationsReadAction, openNotificationAction } from "@/server/me/actions";

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  url: string | null;
  read: boolean;
  createdAt: string;
}

const TYPE_META: Record<NotificationType, { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }> = {
  EVENT_REMINDER: { icon: AlarmClock, tone: "bg-accent-soft text-accent", label: "Lembrete" },
  EVENT_UPDATED: { icon: PencilLine, tone: "bg-info-soft text-info", label: "Evento atualizado" },
  EVENT_CANCELED: { icon: CalendarX, tone: "bg-danger-soft text-danger", label: "Evento cancelado" },
  NEW_EVENT_FROM_FOLLOWED: { icon: Sparkles, tone: "bg-primary-soft text-primary", label: "Novo evento" },
  EVENT_APPROVED: { icon: CircleCheck, tone: "bg-success-soft text-success", label: "Evento aprovado" },
  EVENT_REJECTED: { icon: CircleX, tone: "bg-danger-soft text-danger", label: "Evento recusado" },
  ORG_INVITE: { icon: UserPlus, tone: "bg-primary-soft text-primary", label: "Convite" },
  BILLING: { icon: CreditCard, tone: "bg-warning-soft text-warning", label: "Plano e cobrança" },
  SYSTEM: { icon: Megaphone, tone: "bg-surface-3 text-muted-foreground", label: "Mixtour" },
};

const fullDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" });

function Row({ n, onOpen, busy }: { n: NotificationView; onOpen: (n: NotificationView) => void; busy: boolean }) {
  const meta = TYPE_META[n.type] ?? TYPE_META.SYSTEM;
  const Icon = meta.icon;
  const date = new Date(n.createdAt);
  const inner = (
    <>
      <span className={cn("relative mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl", meta.tone)}>
        <Icon className="size-5" />
        {!n.read && <span className="bg-brand-gradient absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2 ring-surface" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="sr-only">{n.read ? "" : "Não lida. "}{meta.label}: </span>
          <span className={cn("line-clamp-2 text-[15px] leading-snug", n.read ? "font-medium text-foreground/85" : "font-bold text-foreground")}>{n.title}</span>
          <time
            dateTime={n.createdAt}
            title={fullDate.format(date)}
            suppressHydrationWarning
            className={cn("shrink-0 text-xs", n.read ? "text-subtle-foreground" : "font-semibold text-primary")}
          >
            {timeAgo(date)}
          </time>
        </span>
        {n.body && <span className={cn("mt-1 line-clamp-3 block text-sm leading-relaxed", n.read ? "text-subtle-foreground" : "text-muted-foreground")}>{n.body}</span>}
      </span>
    </>
  );
  const cls = cn(
    "flex w-full gap-3.5 rounded-3xl px-3.5 py-3.5 text-left transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    n.read ? "hover:bg-surface-2" : "bg-primary-soft/50 hover:bg-primary-soft/80",
    busy && "opacity-60",
  );
  if (n.url) {
    return (
      <a
        href={n.url}
        className={cls}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onOpen(n);
        }}
      >
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => onOpen(n)} aria-disabled={n.read || undefined}>
      {inner}
    </button>
  );
}

/** Tela de notificações: lista paginada, abrir marca como lida e leva ao destino interno. */
export function NotificationsScreen({ initialItems, initialCursor, initialUnread }: { initialItems: NotificationView[]; initialCursor: string | null; initialUnread: number }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [unread, setUnread] = useState(initialUnread);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [markingAll, startMarkAll] = useTransition();
  const [loadingMore, startLoadMore] = useTransition();

  const markLocal = (id: string) => {
    setItems((list) => list.map((x) => (x.id === id ? { ...x, read: true } : x)));
  };

  const open = async (n: NotificationView) => {
    if (n.read && !n.url) return;
    setOpeningId(n.id);
    if (!n.read) {
      markLocal(n.id);
      setUnread((u) => Math.max(0, u - 1));
    }
    const res = await openNotificationAction(n.id);
    setOpeningId(null);
    if (res.status === "error") {
      toast.error(res.message);
      return;
    }
    const url = res.status === "success" ? res.data?.url : null;
    if (url) router.push(url);
  };

  const markAll = () =>
    startMarkAll(async () => {
      const res = await markAllNotificationsReadAction();
      if (res.status === "error") {
        toast.error(res.message);
        return;
      }
      setItems((list) => list.map((x) => ({ ...x, read: true })));
      setUnread(0);
      toast.success("Todas as notificações foram marcadas como lidas");
    });

  const loadMore = () =>
    startLoadMore(async () => {
      if (!cursor) return;
      const res = await loadMoreNotificationsAction(cursor);
      if (res.status !== "success" || !res.data) {
        toast.error(res.status === "error" ? res.message : "Não foi possível carregar agora.");
        return;
      }
      const { items: more, nextCursor } = res.data;
      setItems((list) => [...list, ...more.filter((m) => !list.some((x) => x.id === m.id))]);
      setCursor(nextCursor);
    });

  const markAllButton = unread > 0 && (
    <Button variant="ghost" size="sm" onClick={markAll} loading={markingAll} className="h-10">
      <CheckCheck /> Marcar todas como lidas
    </Button>
  );

  return (
    <>
      <MobileHeader
        title="Notificações"
        actions={
          unread > 0 ? (
            <Button variant="ghost" size="icon" onClick={markAll} loading={markingAll} aria-label="Marcar todas como lidas" title="Marcar todas como lidas">
              <CheckCheck />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="icon" aria-label="Preferências de notificação">
              <Link href="/perfil/notificacoes">
                <Settings />
              </Link>
            </Button>
          )
        }
      />
      <div className="mx-auto max-w-[760px] px-3 pt-3 sm:px-6 lg:pt-10">
        <header className="mb-6 hidden items-end justify-between gap-4 px-1 lg:flex">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Notificações</h1>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              {unread > 0 ? (unread === 1 ? "Você tem 1 notificação não lida." : `Você tem ${unread} notificações não lidas.`) : "Lembretes, novidades de quem você segue e avisos da sua conta."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {markAllButton}
            <Button asChild variant="ghost" size="sm" className="h-10">
              <Link href="/perfil/notificacoes">
                <Settings /> Preferências
              </Link>
            </Button>
          </div>
        </header>
        <h1 className="sr-only lg:hidden">Notificações</h1>
        {unread > 0 && (
          <p className="px-2 pb-2 text-sm text-muted-foreground lg:hidden" aria-live="polite">
            {unread === 1 ? "1 não lida" : `${unread} não lidas`}
          </p>
        )}

        {items.length === 0 ? (
          <IllustratedEmpty
            icon={<BellRing />}
            title="Nenhuma notificação por aqui"
            description="Quando um evento da sua agenda mudar, chegar a hora de um rolê ou alguém que você segue publicar novidade, você fica sabendo aqui."
            action={
              <>
                <Button asChild variant="primary">
                  <Link href="/">
                    <Compass /> Explorar eventos
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href="/perfil/notificacoes">Ajustar alertas</Link>
                </Button>
              </>
            }
          />
        ) : (
          <>
            <ul className="space-y-1" aria-label="Notificações">
              {items.map((n) => (
                <li key={n.id}>
                  <Row n={n} onOpen={open} busy={openingId === n.id} />
                </li>
              ))}
            </ul>
            {cursor ? (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                  Carregar anteriores
                </Button>
              </div>
            ) : (
              items.length > 8 && <p className="mt-8 text-center text-sm text-subtle-foreground">Você chegou ao fim das notificações.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}

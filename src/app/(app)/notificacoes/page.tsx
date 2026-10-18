import type { Metadata } from "next";
import { NotificationsScreen } from "@/components/me/notification-list";
import { requireUser } from "@/server/auth/guards";
import { listNotifications } from "@/server/me/service";
import { unreadCount } from "@/server/notifications";

export const metadata: Metadata = { title: "Notificações", robots: { index: false, follow: false } };

export default async function NotificationsPage() {
  const user = await requireUser("/notificacoes");
  const [{ items, nextCursor }, unread] = await Promise.all([listNotifications(user.id), unreadCount(user.id)]);
  return (
    <main className="pb-nav lg:pb-16">
      <NotificationsScreen initialItems={items} initialCursor={nextCursor} initialUnread={unread} />
    </main>
  );
}

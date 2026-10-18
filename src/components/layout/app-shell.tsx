import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { unreadCount } from "@/server/notifications";
import { NativePushSync } from "@/components/native/native-bridge";
import { BottomNav } from "./bottom-nav";
import type { NavUser } from "./nav-items";
import { SiteHeader } from "./site-header";

export async function getNavUser(): Promise<{ user: NavUser | null; unread: number }> {
  const session = await getSessionUser();
  if (!session) return { user: null, unread: 0 };
  const [unread, memberships] = await Promise.all([
    unreadCount(session.id),
    prisma.membership.count({ where: { userId: session.id } }),
  ]);
  return {
    unread,
    user: {
      name: session.name,
      email: session.email,
      avatarUrl: session.avatarUrl,
      isAdmin: session.isAdmin,
      hasOrganization: memberships > 0,
      emailVerified: session.emailVerified,
    },
  };
}

/** Estrutura do app do explorador: cabeçalho (desktop) + navegação inferior (celular). */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const { user, unread } = await getNavUser();
  return (
    <>
      <SiteHeader user={user} unread={unread} />
      {children}
      <BottomNav loggedIn={Boolean(user)} unread={unread} />
      <NativePushSync loggedIn={Boolean(user)} />
    </>
  );
}

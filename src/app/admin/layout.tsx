import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { adminBadges } from "@/server/admin/overview";
import { requireAdmin } from "@/server/auth/guards";
import { prisma } from "@/server/db";

export const metadata: Metadata = {
  title: { default: "Administração", template: "%s · Admin Mixtour" },
  robots: { index: false, follow: false },
};

/** Administração da plataforma: layout próprio (sem a barra inferior do app). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();
  const [badges, memberships] = await Promise.all([adminBadges(), prisma.membership.count({ where: { userId: user.id } })]);
  return (
    <AdminShell
      user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl, isAdmin: true, hasOrganization: memberships > 0, emailVerified: user.emailVerified }}
      badges={badges}
    >
      {children}
    </AdminShell>
  );
}

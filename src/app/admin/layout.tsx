import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { requirePlatformAdminPage } from "@/server/auth/guard";
import { LogoutButton } from "./actions";
import { AdminNav } from "./nav";

/** Toda a área /admin é protegida no servidor: somente contas com userRole = ADMIN. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatformAdminPage();
  return (
    <div className="min-h-screen bg-background">
      <header className="flex h-14 items-center justify-between gap-4 border-b bg-sidebar px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <Logo inverted />
          <Badge variant="demo">Admin</Badge>
        </div>
        <AdminNav />
        <div className="flex items-center gap-3 text-xs text-sidebar-foreground">
          <span className="hidden md:inline">{ctx.userName}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] p-4 lg:p-6">{children}</main>
    </div>
  );
}

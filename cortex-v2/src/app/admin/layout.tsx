import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { requireSuperAdmin } from "@/server/auth/context";

export const metadata = { title: { default: "Admin", template: "%s · Admin · JR Córtex" }, robots: { index: false } };

const NAV = [
  ["/admin", "Visão geral"],
  ["/admin/organizations", "Empresas"],
  ["/admin/users", "Usuários"],
  ["/admin/plans", "Planos"],
  ["/admin/subscriptions", "Assinaturas"],
  ["/admin/usage", "Uso"],
  ["/admin/logs", "Logs"],
  ["/admin/system", "Sistema"],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSuperAdmin();
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-semibold"><Logo /> <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-destructive">Super Admin</span></Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-[13px]">
            {NAV.map(([href, label]) => <Link key={href} href={href!} className="rounded-md px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground">{label}</Link>)}
          </nav>
          <span className="text-xs text-muted-foreground">{s.user.email}</span>
          <Link href="/app" className="text-xs text-primary hover:underline">Ir para o app</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">{children}</main>
    </div>
  );
}

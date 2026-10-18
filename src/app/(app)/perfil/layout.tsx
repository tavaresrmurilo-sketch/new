import { ProfileSideNav } from "@/components/me/profile-nav";
import { requireUser } from "@/server/auth/guards";

/** Perfil: no celular cada página ocupa a tela; no desktop, navegação lateral entre as subpáginas. */
export default async function ProfileLayout({ children }: LayoutProps<"/perfil">) {
  const user = await requireUser("/perfil");
  return (
    <div className="pb-nav lg:pb-16">
      <div className="mx-auto lg:grid lg:max-w-6xl lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-12 lg:px-6 lg:pt-10">
        <aside className="hidden lg:block">
          <ProfileSideNav user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }} />
        </aside>
        <div className="min-w-0 lg:max-w-[760px]">{children}</div>
      </div>
    </div>
  );
}

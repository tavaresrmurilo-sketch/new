import { ProfileForm } from "@/features/settings/components/settings-forms";
import { prisma } from "@/lib/db";
import { requireCtx } from "@/server/auth/context";

export const metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const ctx = await requireCtx();
  const u = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { name: true, email: true, avatarUrl: true } });
  return <ProfileForm initial={{ name: u!.name, email: u!.email, avatarUrl: u!.avatarUrl }} />;
}

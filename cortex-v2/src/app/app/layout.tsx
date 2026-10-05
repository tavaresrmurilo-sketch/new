import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** Toda rota /app exige sessão válida; o workspace e as permissões são verificados em cada layout/página. */
export default async function AppRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return children;
}

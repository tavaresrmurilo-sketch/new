import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { getTenant, requireUser } from "@/server/session";
import { OnboardingAccountMenu } from "./account-menu";
import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Configurar empresa" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (await getTenant()) redirect("/painel");
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="container-page flex items-center justify-between py-5">
        <Logo href="/onboarding" />
        <ThemeToggle />
      </header>
      <main className="container-page flex flex-col items-center gap-8 pb-16">
        <OnboardingFlow userName={user.name} />
        <OnboardingAccountMenu email={user.email} />
      </main>
    </div>
  );
}

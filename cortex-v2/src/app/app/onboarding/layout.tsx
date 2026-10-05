import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-subtle">
      <header className="flex h-14 items-center justify-between border-b bg-background px-6">
        <Link href="/app/dashboard">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>
    </div>
  );
}

import { CheckCircle2Icon } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";

const POINTS = [
  "Saiba quais clientes precisam de um novo atendimento",
  "Mensagens personalizadas pelo WhatsApp em um clique",
  "Indicadores reais de retorno e receita registrada",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.07]" />
        <div className="pointer-events-none absolute -top-32 -right-24 size-[28rem] rounded-full bg-emerald/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-primary/40 blur-3xl" />
        <Logo inverted className="relative" />
        <div className="relative max-w-md space-y-8">
          <h2 className="font-display text-4xl leading-tight font-bold text-balance">
            Clientes que voltam. <span className="text-emerald">Negócios que crescem.</span>
          </h2>
          <ul className="space-y-4">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sidebar-foreground">
                <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-sidebar-muted">Seus dados ficam isolados por empresa e protegidos conforme a LGPD.</p>
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </div>
      </main>
    </div>
  );
}

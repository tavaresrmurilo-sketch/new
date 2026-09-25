import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Logo inverted />
        <div className="max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">JR Cortex AI</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Inteligência para decisões melhores.</h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">
            Conecte seus dados, acompanhe resultados e pergunte em linguagem natural. Para uso individual ou empresarial — sempre com números calculados a partir dos seus dados.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-sidebar-foreground/85">
            <li>• Painéis, fluxo de caixa e projeções automáticos</li>
            <li>• Respostas com cálculo auditável</li>
            <li>• Dados isolados, criptografados e auditados</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">© {new Date().getFullYear()} JR Consultorias</p>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  );
}

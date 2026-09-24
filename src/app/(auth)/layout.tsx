import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <Logo inverted />
        <div className="max-w-md">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-gold">Inteligência empresarial conectada aos seus dados</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white">Transforme os dados da sua empresa em decisões.</h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">
            O Cortex centraliza informações financeiras, comerciais e operacionais, calcula indicadores com rastreabilidade e responde perguntas em linguagem natural — sem inventar números.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-sidebar-foreground/85">
            <li>• DRE, fluxo de caixa e projeções automáticos</li>
            <li>• Pergunte ao Cortex com cálculo auditável</li>
            <li>• Dados isolados por empresa, com criptografia e auditoria</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">© {new Date().getFullYear()} JR Consultorias</p>
      </div>
      <div className="flex items-center justify-center p-6">{children}</div>
    </div>
  );
}

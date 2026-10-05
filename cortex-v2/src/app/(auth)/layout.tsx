import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const POINTS = [
  "Clientes, vendas, projetos e tarefas em um só lugar",
  "Morning Brief com o que precisa da sua atenção hoje",
  "Córtex AI que responde com base nos seus dados — sem inventar",
  "Multiempresa, permissões granulares e LGPD desde o início",
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r bg-subtle p-10 lg:flex">
        <Link href="/" aria-label="JR Córtex — página inicial">
          <Logo />
        </Link>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Sua empresa tem dados.
            <br />
            <span className="text-muted-foreground">O Córtex transforma dados em decisões.</span>
          </h2>
          <ul className="space-y-3 text-sm">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-2 text-muted-foreground">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} JR Córtex · Business Intelligence & Operations AI</p>
      </aside>
      <main className="flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="mb-8 lg:hidden">
          <Link href="/">
            <Logo />
          </Link>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

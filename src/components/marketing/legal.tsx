import { ChevronDown, FileText, Scale, TriangleAlert } from "lucide-react";
import Link from "next/link";

export interface LegalSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

/** Data da última revisão dos documentos legais (atualize junto com o texto). */
export const LEGAL_UPDATED_AT = "18 de outubro de 2026";

const prose =
  "text-[15px] leading-[1.75] text-foreground/85 [&_a]:font-semibold [&_a]:text-primary [&_a:hover]:underline [&_li]:mt-2 [&_li]:pl-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-3 [&_p:first-child]:mt-0 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li::marker]:text-subtle-foreground";

/** Estrutura dos documentos legais: aviso de versão, índice e seções numeradas. */
export function LegalDocument({
  kind,
  title,
  intro,
  sections,
}: {
  kind: "termos" | "privacidade";
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  const other = kind === "termos" ? { href: "/privacidade", label: "Política de Privacidade" } : { href: "/termos", label: "Termos de Uso" };
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 sm:px-6 lg:pt-14">
      <header className="max-w-3xl">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          {kind === "termos" ? <Scale className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />} Documentos legais
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] sm:text-5xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Última atualização: {LEGAL_UPDATED_AT}</p>
        <div role="note" className="mt-6 flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <p className="leading-relaxed">
            <strong className="font-semibold text-warning">Versão inicial — revisar com assessoria jurídica antes do lançamento.</strong>{" "}
            <span className="text-foreground/80">Trechos entre colchetes ainda precisam ser completados com os dados da empresa responsável.</span>
          </p>
        </div>
        <div className={`mt-6 ${prose} text-[16px]`}>{intro}</div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="Índice" className="lg:sticky lg:top-24 lg:self-start">
          <details className="group rounded-2xl border border-border bg-surface lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              Índice <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" aria-hidden />
            </summary>
            <Toc sections={sections} className="border-t border-border px-2 py-2" />
          </details>
          <div className="hidden lg:block">
            <p className="px-3 text-xs font-bold tracking-wide text-subtle-foreground uppercase">Nesta página</p>
            <Toc sections={sections} className="mt-2" />
          </div>
        </nav>

        <div className="min-w-0 max-w-3xl">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="scroll-mt-24 border-t border-border py-8 first:border-t-0 first:pt-0">
              <h2 id={`${s.id}-t`} className="flex gap-3 text-xl font-bold tracking-tight">
                <span className="text-primary tabular-nums">{i + 1}.</span>
                <span>{s.title}</span>
              </h2>
              <div className={`mt-4 ${prose}`}>{s.content}</div>
            </section>
          ))}
          <div className="mt-4 rounded-3xl border border-border bg-surface p-5 text-sm text-muted-foreground sm:p-6">
            Leia também a{" "}
            <Link href={other.href} className="font-semibold text-primary hover:underline">
              {other.label}
            </Link>
            .
          </div>
        </div>
      </div>
    </main>
  );
}

function Toc({ sections, className }: { sections: LegalSection[]; className?: string }) {
  return (
    <ol className={className}>
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="flex min-h-10 items-center gap-2 rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-surface-2 hover:text-foreground focus-visible:bg-surface-2 focus-visible:outline-none"
          >
            <span className="w-5 shrink-0 text-xs font-semibold tabular-nums text-subtle-foreground">{i + 1}.</span>
            <span>{s.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

import type { ReactNode } from "react";

export function InfoPage({ eyebrow, title, intro, updated, children }: { eyebrow: string; title: string; intro?: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <div className="container-page pt-10 sm:pt-14">
      <header className="max-w-3xl">
        <p className="spec text-accent">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-5xl">{title}</h1>
        {intro && <p className="mt-4 text-lg leading-relaxed text-muted">{intro}</p>}
        {updated && <p className="spec mt-4 text-faint">Atualizado em {updated}</p>}
      </header>
      <div className="mt-10">{children}</div>
    </div>
  );
}

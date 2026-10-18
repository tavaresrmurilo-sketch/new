import { MobileHeader } from "@/components/layout/mobile-header";

/** Topo das subpáginas do perfil: barra com "voltar" no celular, título + descrição no desktop. */
export function ProfileSubpageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <>
      <MobileHeader title={title} back="/perfil" />
      <header className="hidden lg:mb-8 lg:block">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </header>
      <h1 className="sr-only lg:hidden">{title}</h1>
      {description && <p className="px-1 pt-4 text-sm text-muted-foreground lg:hidden">{description}</p>}
    </>
  );
}

/** Bloco de configurações com título, descrição e conteúdo. */
export function SettingsSection({
  id,
  title,
  description,
  children,
  action,
}: {
  id?: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-24 rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-lg font-bold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

import { CalendarCheck2, ChartNoAxesColumn, MapPinned } from "lucide-react";
import type { Metadata } from "next";
import { OnboardingForm } from "@/components/painel/onboarding-form";
import { requireUser } from "@/server/auth/guards";
import { getPlan } from "@/server/billing/plans";
import { prisma } from "@/server/db";
import { getUserMemberships } from "@/server/organizations/current";

export const metadata: Metadata = { title: "Criar organização" };

export default async function ComecarPage() {
  const user = await requireUser("/painel/comecar");
  const [memberships, free, profile] = await Promise.all([
    getUserMemberships(user.id),
    getPlan("FREE"),
    prisma.user.findUnique({ where: { id: user.id }, select: { homeCity: true } }),
  ]);
  const first = memberships.length === 0;
  const firstName = user.name.split(/\s+/)[0];

  const perks = [
    { icon: MapPinned, title: "No mapa da cidade", text: "Seus eventos aparecem para quem está procurando o que fazer por perto." },
    {
      icon: CalendarCheck2,
      title: "Gratuito para começar",
      text: free.maxActiveEvents == null ? "Publique quantos eventos quiser no plano Gratuito." : `Até ${free.maxActiveEvents} eventos ativos ao mesmo tempo no plano ${free.name}.`,
    },
    { icon: ChartNoAxesColumn, title: "Métricas reais", text: "Acompanhe visualizações, salvamentos, “vou” e cliques em ingresso." },
  ];

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1fr_28rem] lg:gap-14 lg:pt-14">
      <section className="lg:pt-6">
        <p className="text-sm font-semibold text-primary">{first ? `Olá, ${firstName}!` : "Nova organização"}</p>
        <h1 className="mt-2 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
          {first ? (
            <>
              Vamos colocar seus eventos <span className="text-brand-gradient">no mapa</span>
            </>
          ) : (
            "Crie outra organização"
          )}
        </h1>
        <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground">
          {first
            ? "Primeiro, crie o perfil de quem organiza: pode ser uma casa de shows, um coletivo, uma produtora ou você mesmo. Leva menos de um minuto."
            : "Cada organização tem perfil, eventos, equipe e plano próprios. Você alterna entre elas no topo do painel."}
        </p>
        <ul className="mt-8 hidden flex-col gap-5 lg:flex">
          {perks.map((p) => (
            <li key={p.title} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                <p.icon className="size-5" />
              </span>
              <span>
                <span className="block font-bold">{p.title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Dados da organização" className="rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7">
        <OnboardingForm defaultCity={profile?.homeCity} />
      </section>
    </main>
  );
}

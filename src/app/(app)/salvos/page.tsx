import { Bookmark, CalendarCheck, Compass, History, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MobileHeader } from "@/components/layout/mobile-header";
import { AgendaItem, type AgendaMode } from "@/components/me/agenda-item";
import { AgendaTabs } from "@/components/me/agenda-tabs";
import { IllustratedEmpty } from "@/components/me/empty-illustration";
import { FollowedOrgItem } from "@/components/me/followed-org-item";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth/guards";
import {
  agendaCounts,
  followedOrganizers,
  HISTORY_MAX,
  HISTORY_STEP,
  parseAgendaTab,
  pastEvents,
  upcomingRsvps,
  upcomingSaves,
  type AgendaItem as AgendaItemData,
  type AgendaTab,
} from "@/server/me/agenda";
import { groupByDay, type DayGroup } from "@/server/me/helpers";

export const metadata: Metadata = { title: "Minha agenda", robots: { index: false, follow: false } };

const DESCRIPTION: Record<AgendaTab, string> = {
  vou: "Os eventos em que você marcou presença ou interesse, dia a dia.",
  salvos: "O que você guardou para decidir depois.",
  seguindo: "Organizadores que você acompanha e o que eles têm programado.",
  historico: "Os rolês que já passaram.",
};

function takeParam(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  if (!Number.isFinite(n) || n <= HISTORY_STEP) return HISTORY_STEP;
  return Math.min(HISTORY_MAX, Math.ceil(n / HISTORY_STEP) * HISTORY_STEP);
}

function ExploreCta({ label = "Explorar eventos" }: { label?: string }) {
  return (
    <Button asChild variant="primary">
      <Link href="/">
        <Compass /> {label}
      </Link>
    </Button>
  );
}

function DayGroups({ groups, mode }: { groups: DayGroup<AgendaItemData>[]; mode: AgendaMode }) {
  return (
    <div className="space-y-7">
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`dia-${g.key}`}>
          <h2
            id={`dia-${g.key}`}
            className="mb-3 flex items-center gap-2 text-[13px] font-bold tracking-wide text-subtle-foreground uppercase first-letter:uppercase"
          >
            <span className={g.label === "Hoje" ? "text-accent" : undefined}>{g.label}</span>
            <span className="h-px flex-1 bg-border" aria-hidden />
            <span className="font-semibold normal-case">{g.items.length === 1 ? "1 evento" : `${g.items.length} eventos`}</span>
          </h2>
          <ul className="space-y-3">
            {g.items.map((item) => (
              <li key={item.event.id}>
                <AgendaItem event={item.event} availability={item.availability} rsvp={item.rsvp} saved={item.saved} mode={mode} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default async function AgendaPage({ searchParams }: PageProps<"/salvos">) {
  const user = await requireUser("/salvos");
  const sp = await searchParams;
  const tab = parseAgendaTab(sp.aba);
  const now = new Date();
  const counts = await agendaCounts(user.id, now);

  let content: React.ReactNode;
  if (tab === "vou") {
    const groups = await upcomingRsvps(user.id, now);
    content = groups.length ? (
      <DayGroups groups={groups} mode="going" />
    ) : (
      <IllustratedEmpty
        icon={<CalendarCheck />}
        title="Nenhum rolê marcado ainda"
        description="Toque em “Vou” ou “Tenho interesse” na página de um evento e ele aparece aqui, organizado por dia."
        action={<ExploreCta />}
      />
    );
  } else if (tab === "salvos") {
    const groups = await upcomingSaves(user.id, now);
    content = groups.length ? (
      <DayGroups groups={groups} mode="saved" />
    ) : (
      <IllustratedEmpty
        icon={<Bookmark />}
        title="Nada salvo por enquanto"
        description="Viu algo interessante mas ainda não decidiu? Toque no marcador do evento para guardar e encontrar aqui depois."
        action={<ExploreCta />}
      />
    );
  } else if (tab === "seguindo") {
    const orgs = await followedOrganizers(user.id, now);
    content = orgs.length ? (
      <ul className="space-y-3">
        {orgs.map((o) => (
          <li key={o.id}>
            <FollowedOrgItem
              org={{
                id: o.id,
                slug: o.slug,
                name: o.name,
                logoUrl: o.logoUrl,
                verified: o.verified,
                place: [o.city, o.state].filter(Boolean).join(" - ") || null,
                active: o.active,
                upcomingCount: o.upcomingCount,
                nextEvent: o.nextEvent,
              }}
            />
          </li>
        ))}
      </ul>
    ) : (
      <IllustratedEmpty
        icon={<Users />}
        title="Você ainda não segue ninguém"
        description="Siga produtoras, casas de show e coletivos para saber primeiro quando sair evento novo."
        action={<ExploreCta label="Descobrir organizadores" />}
      />
    );
  } else {
    const take = takeParam(sp.ver);
    const { items, hasMore } = await pastEvents(user.id, { take, now });
    const groups = groupByDay(items, (i) => ({ startsAt: new Date(i.event.startsAt), timezone: i.event.timezone }), now);
    content = groups.length ? (
      <>
        <DayGroups groups={groups} mode="history" />
        {hasMore && take < HISTORY_MAX && (
          <div className="mt-8 flex justify-center">
            <Button asChild variant="secondary">
              <Link href={`/salvos?aba=historico&ver=${take + HISTORY_STEP}`} scroll={false}>
                Ver mais antigos
              </Link>
            </Button>
          </div>
        )}
      </>
    ) : (
      <IllustratedEmpty
        icon={<History />}
        title="Seu histórico começa no primeiro rolê"
        description="Os eventos que já passaram — e em que você marcou presença ou salvou — ficam guardados aqui."
        action={<ExploreCta />}
      />
    );
  }

  return (
    <main className="pb-nav lg:pb-16">
      <MobileHeader title="Minha agenda" />
      <div className="mx-auto max-w-[760px] px-4 pt-4 sm:px-6 lg:pt-10">
        <header className="mb-5 hidden lg:block">
          <h1 className="text-3xl font-extrabold tracking-tight">Minha agenda</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">{DESCRIPTION[tab]}</p>
        </header>
        <h1 className="sr-only lg:hidden">Minha agenda</h1>
        <AgendaTabs
          active={tab}
          tabs={[
            { value: "vou", label: "Vou", count: counts.going },
            { value: "salvos", label: "Salvos", count: counts.saved },
            { value: "seguindo", label: "Seguindo", count: counts.following },
            { value: "historico", label: "Histórico" },
          ]}
        />
        <p className="mt-4 text-sm text-muted-foreground lg:hidden">{DESCRIPTION[tab]}</p>
        <div className="mt-5 lg:mt-7">{content}</div>
      </div>
    </main>
  );
}

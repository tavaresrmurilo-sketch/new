import type { Metadata } from "next";
import { cache } from "react";
import { ExploreScreen, type ExploreViewer } from "@/components/explore/explore-screen";
import type { InitialList } from "@/components/explore/use-explore-data";
import { listUrl } from "@/components/explore/urls";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, CITY_ZOOM } from "@/lib/constants";
import { describeFilters, hasRestrictingFilters, parseExploreParams, serializeFilters, viewToBBox, type MapView } from "@/lib/explore-params";
import { isValidLatLng } from "@/lib/geo";
import { getSessionUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { activeCategories, searchEventList } from "@/server/events/search";

const getCategories = cache(activeCategories);

function titleFor(filters: ReturnType<typeof parseExploreParams>["filters"], names: Record<string, string>) {
  return hasRestrictingFilters(filters) ? describeFilters(filters, names) : null;
}

export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const { filters } = parseExploreParams(await searchParams);
  const categories = await getCategories();
  const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const filtered = titleFor(filters, names);
  const qs = serializeFilters({ ...filters, sort: "relevancia" });
  const canonical = qs ? `/?${qs}` : "/";
  const description = filtered
    ? `${filtered} no mapa: veja onde acontece, horários, preços e como chegar. Salve e receba lembretes no ${APP_NAME}.`
    : APP_DESCRIPTION;
  return {
    title: filtered ?? { absolute: `${APP_NAME} — ${APP_TAGLINE}` },
    description,
    alternates: { canonical },
    // páginas de busca livre não devem ser indexadas (conteúdo infinito e volátil)
    robots: filters.q ? { index: false, follow: true } : undefined,
    openGraph: { title: filtered ? `${filtered} · ${APP_NAME}` : `${APP_NAME} — ${APP_TAGLINE}`, description, url: canonical },
  };
}

/** Explorar: mapa interativo de eventos, busca e filtros (tela principal). */
export default async function ExplorePage({ searchParams }: PageProps<"/">) {
  const state = parseExploreParams(await searchParams);
  const [session, categories] = await Promise.all([getSessionUser(), getCategories()]);

  let homeView: MapView | null = null;
  if (session) {
    const home = await prisma.user.findUnique({ where: { id: session.id }, select: { homeLat: true, homeLng: true } });
    if (home && isValidLatLng(home.homeLat, home.homeLng)) homeView = { lat: home.homeLat!, lng: home.homeLng!, zoom: CITY_ZOOM };
  }

  // Primeira página para a renderização inicial e indexação. Com busca e sem posição, a busca é global.
  const view = state.view ?? homeView;
  const bbox = state.filters.q && !state.view ? null : view ? viewToBBox(view, 1000, 800) : null;
  let initialList: InitialList | null = null;
  try {
    const data = await searchEventList({ filters: state.filters, bbox });
    initialList = { url: listUrl(bbox, null, state.filters), data };
  } catch (err) {
    console.error("[explorar] falha na lista inicial", err);
  }

  const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const viewer: ExploreViewer | null = session ? { name: session.name, avatarUrl: session.avatarUrl } : null;

  return (
    <ExploreScreen
      categories={categories}
      initialFilters={state.filters}
      urlView={state.view}
      homeView={homeView}
      initialMode={state.mode}
      initialList={initialList}
      viewer={viewer}
      title={titleFor(state.filters, names) ?? "Eventos perto de você no mapa"}
    />
  );
}

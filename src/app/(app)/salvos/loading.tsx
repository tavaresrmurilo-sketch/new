import { EventCardSkeleton } from "@/components/events/event-card";
import { Skeleton } from "@/components/ui/misc";

export default function AgendaLoading() {
  return (
    <main className="pb-nav" aria-busy="true" aria-label="Carregando sua agenda">
      <div className="safe-top sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center px-4 text-[17px] font-bold tracking-tight">Minha agenda</div>
      </div>
      <div className="mx-auto max-w-[760px] px-4 pt-4 sm:px-6 lg:pt-10">
        <div className="mb-5 hidden lg:block">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-3 h-4 w-80" />
        </div>
        <Skeleton className="h-[52px] w-full rounded-full" />
        <div className="mt-7 space-y-3">
          <Skeleton className="h-3 w-24 rounded-full" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-border bg-surface">
              <EventCardSkeleton />
              <div className="flex h-14 items-center border-t border-border px-4">
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

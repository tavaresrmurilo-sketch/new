import { Skeleton } from "@/components/ui/misc";

export default function NotificationsLoading() {
  return (
    <main className="pb-nav" aria-busy="true" aria-label="Carregando notificações">
      <div className="safe-top sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center px-4 text-[17px] font-bold tracking-tight">Notificações</div>
      </div>
      <div className="mx-auto max-w-[760px] px-3 pt-3 sm:px-6 lg:pt-10">
        <div className="mb-6 hidden px-1 lg:block">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-3 h-4 w-72" />
        </div>
        <div className="space-y-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3.5 px-3.5 py-3.5">
              <Skeleton className="size-11 shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-4 w-3/4 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

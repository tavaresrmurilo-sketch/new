import { Skeleton } from "@/components/ui/misc";

export default function AdminLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 pt-5 pb-16 sm:px-6 lg:px-10 lg:pt-9" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-full max-w-md" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-3xl" />
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-3xl" />
        ))}
      </div>
    </main>
  );
}

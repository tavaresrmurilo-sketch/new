"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/** Topo das páginas internas no celular (título + voltar + ações). */
export function MobileHeader({
  title,
  back,
  actions,
  className,
  transparent,
}: {
  title?: React.ReactNode;
  back?: string | true;
  actions?: React.ReactNode;
  className?: string;
  transparent?: boolean;
}) {
  const router = useRouter();
  return (
    <div
      className={cn(
        "safe-top sticky top-0 z-40 lg:hidden",
        transparent ? "bg-transparent" : "border-b border-border bg-background/85 backdrop-blur-xl",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-2 px-2">
        {back ? (
          typeof back === "string" ? (
            <Link href={back} aria-label="Voltar" className="grid size-10 place-items-center rounded-full hover:bg-surface-2">
              <ChevronLeft className="size-6" />
            </Link>
          ) : (
            <button
              type="button"
              aria-label="Voltar"
              onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
              className="grid size-10 place-items-center rounded-full hover:bg-surface-2"
            >
              <ChevronLeft className="size-6" />
            </button>
          )
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight">{title}</div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </div>
  );
}

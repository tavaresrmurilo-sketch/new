"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Select que grava a escolha na URL (filtros e ordenação). */
export function UrlSelect({
  param,
  value,
  options,
  label,
  className,
  defaultValue,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
  defaultValue?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === defaultValue) params.delete(param);
    else params.set(param, next);
    params.delete("pagina");
    startTransition(() => router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  return (
    <Select value={value} onValueChange={change}>
      <SelectTrigger aria-label={label} className={cn("w-full sm:w-48", pending && "opacity-60", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

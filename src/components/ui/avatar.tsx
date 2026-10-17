import { cn, initials } from "@/lib/utils";

const sizes = { xs: "size-7 text-[11px]", sm: "size-9 text-xs", md: "size-11 text-sm", lg: "size-16 text-lg", xl: "size-24 text-2xl" } as const;

export function Avatar({
  name,
  src,
  size = "md",
  className,
  square,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
  square?: boolean;
}) {
  const shape = square ? "rounded-2xl" : "rounded-full";
  if (src) {
    return <img src={src} alt="" className={cn(sizes[size], shape, "shrink-0 bg-surface-2 object-cover", className)} loading="lazy" decoding="async" />;
  }
  return (
    <span aria-hidden className={cn(sizes[size], shape, "bg-brand-gradient grid shrink-0 place-items-center font-bold text-white", className)}>
      {initials(name)}
    </span>
  );
}

import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "dark" | "outline" | "ghost" | "danger" | "light";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]",
  dark: "bg-ink text-white hover:bg-ink-2",
  outline: "border border-line-strong bg-surface text-ink hover:border-ink/40 hover:bg-sunken/60",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
  light: "bg-white text-ink hover:bg-white/90",
};

const sizes: Record<Size, string> = {
  sm: "h-9 rounded-md px-3 text-sm",
  md: "h-11 rounded-md px-4 text-[0.95rem]",
  lg: "h-12 rounded-lg px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

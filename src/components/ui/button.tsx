import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-gradient text-white shadow-[0_8px_24px_-10px_rgb(255_77_141_/_0.7)] hover:brightness-110",
        solid: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-surface-2 text-foreground hover:bg-surface-3",
        outline: "border border-border-strong bg-transparent text-foreground hover:bg-surface-2",
        ghost: "bg-transparent text-foreground hover:bg-surface-2",
        danger: "bg-danger text-white hover:brightness-110",
        "danger-soft": "bg-danger-soft text-danger hover:brightness-95 dark:hover:brightness-125",
        soft: "bg-primary-soft text-primary hover:brightness-95 dark:hover:brightness-125",
        glass: "glass border border-border text-foreground shadow-float hover:bg-surface-2",
        link: "h-auto bg-transparent p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 rounded-full px-3.5 text-sm [&_svg]:size-4",
        md: "h-11 rounded-full px-5 text-[15px] [&_svg]:size-[18px]",
        lg: "h-13 rounded-full px-7 text-base [&_svg]:size-5",
        icon: "size-11 rounded-full [&_svg]:size-5",
        "icon-sm": "size-9 rounded-full [&_svg]:size-[18px]",
        "icon-lg": "size-13 rounded-full [&_svg]:size-6",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent" />
            </span>
          )}
          <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
        </>
      )}
    </Comp>
  );
});

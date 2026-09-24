import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4", {
  variants: {
    variant: {
      default: "border-transparent bg-primary/10 text-primary dark:bg-primary/20",
      secondary: "border-transparent bg-secondary text-secondary-foreground",
      outline: "text-foreground",
      success: "border-transparent bg-success/10 text-success",
      warning: "border-transparent bg-warning/10 text-warning",
      critical: "border-transparent bg-critical/10 text-critical",
      info: "border-transparent bg-info/10 text-info",
      demo: "border-brand-gold/40 bg-brand-gold/15 text-[hsl(36,80%,30%)] dark:text-brand-gold",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

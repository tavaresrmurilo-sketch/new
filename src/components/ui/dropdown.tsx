"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Dropdown.Root;
export const DropdownTrigger = Dropdown.Trigger;

export function DropdownContent({ className, align = "end", ...props }: React.ComponentPropsWithoutRef<typeof Dropdown.Content>) {
  return (
    <Dropdown.Portal>
      <Dropdown.Content
        align={align}
        sideOffset={8}
        className={cn("z-[90] min-w-52 rounded-2xl border border-border bg-elevated p-1.5 text-foreground shadow-float data-[state=open]:animate-fade-in", className)}
        {...props}
      />
    </Dropdown.Portal>
  );
}

export function DropdownItem({ className, destructive, ...props }: React.ComponentPropsWithoutRef<typeof Dropdown.Item> & { destructive?: boolean }) {
  return (
    <Dropdown.Item
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-4 [&_svg]:text-muted-foreground",
        destructive && "text-danger [&_svg]:text-danger",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownSeparator() {
  return <Dropdown.Separator className="my-1 h-px bg-border" />;
}

export function DropdownLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof Dropdown.Label>) {
  return <Dropdown.Label className={cn("px-3 pt-2 pb-1 text-xs font-semibold text-subtle-foreground", className)} {...props} />;
}

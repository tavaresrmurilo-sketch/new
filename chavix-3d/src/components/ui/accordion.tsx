"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";

export function Accordion({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <AccordionPrimitive.Root type="single" collapsible className="divide-y divide-line border-y border-line">
      {items.map((item, i) => (
        <AccordionPrimitive.Item key={item.q} value={`item-${i}`}>
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="group flex w-full items-center justify-between gap-6 py-5 text-left text-[1.02rem] font-medium transition-colors hover:text-accent">
              {item.q}
              <Plus className="h-5 w-5 shrink-0 text-muted transition-transform duration-300 group-data-[state=open]:rotate-45" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-[collapse_.2s_ease-out] data-[state=open]:animate-[expand_.25s_ease-out]">
            <p className="max-w-3xl pb-5 leading-relaxed text-muted">{item.a}</p>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}

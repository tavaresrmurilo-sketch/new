"use client";

import { CalendarPlus, ChevronDown, Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";

function GoogleCalendarGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="4" fill="#fff" stroke="#DADCE0" />
      <path d="M3 8h18" stroke="#4285F4" strokeWidth="3" />
      <text x="12" y="18.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#4285F4" fontFamily="Arial, sans-serif">
        31
      </text>
    </svg>
  );
}

/** "Adicionar à agenda": Google Agenda (link) ou arquivo .ics (Apple, Outlook e outros). */
export function AddToCalendar({
  googleUrl,
  icsUrl,
  size = "sm",
  variant = "secondary",
  block,
  className,
}: {
  googleUrl: string;
  icsUrl: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  block?: boolean;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button type="button" size={size} variant={variant} block={block} className={className}>
          <CalendarPlus /> Adicionar à agenda <ChevronDown className="-mr-1 opacity-70" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-64">
        <DropdownLabel>Salvar no seu calendário</DropdownLabel>
        <DropdownItem asChild>
          <a href={googleUrl} target="_blank" rel="noopener noreferrer">
            <GoogleCalendarGlyph className="!size-[18px] !text-inherit" /> Google Agenda
          </a>
        </DropdownItem>
        <DropdownItem asChild>
          <a href={icsUrl} download>
            <Download /> Apple, Outlook e outros (.ics)
          </a>
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

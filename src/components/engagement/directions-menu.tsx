"use client";

import { CarTaxiFront, ChevronDown, Map as MapIcon, MapPinned, Navigation, Route } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { directionsLinks } from "@/lib/geo";

/** Menu "Como chegar": Google Maps, Waze, Apple Maps e Uber (abrem em nova aba / no app). */
export function DirectionsMenu({
  lat,
  lng,
  label,
  size = "sm",
  variant = "secondary",
  className,
}: {
  lat: number;
  lng: number;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const links = directionsLinks({ lat, lng }, label);
  const items = [
    { href: links.google, name: "Google Maps", icon: MapIcon, color: "#34A853" },
    { href: links.waze, name: "Waze", icon: Navigation, color: "#33CCFF" },
    { href: links.apple, name: "Apple Maps", icon: MapPinned, color: "#FF3B30" },
    { href: links.uber, name: "Uber", icon: CarTaxiFront, color: "currentColor" },
  ];
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <Button type="button" size={size} variant={variant} className={className}>
          <Route /> Como chegar <ChevronDown className="-mr-1 opacity-70" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-56">
        <DropdownLabel>Abrir rota no</DropdownLabel>
        {items.map((i) => (
          <DropdownItem key={i.name} asChild>
            <a href={i.href} target="_blank" rel="noopener noreferrer">
              <i.icon style={{ color: i.color }} /> {i.name}
            </a>
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownMenu>
  );
}

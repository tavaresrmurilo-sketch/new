import {
  Baby,
  Briefcase,
  Clapperboard,
  Drama,
  Dumbbell,
  Footprints,
  GraduationCap,
  Laugh,
  Music,
  Palette,
  PartyPopper,
  Sparkles,
  Store,
  Tent,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  music: Music,
  "party-popper": PartyPopper,
  tent: Tent,
  drama: Drama,
  laugh: Laugh,
  palette: Palette,
  clapperboard: Clapperboard,
  "utensils-crossed": UtensilsCrossed,
  store: Store,
  dumbbell: Dumbbell,
  footprints: Footprints,
  baby: Baby,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  sparkles: Sparkles,
};

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = CATEGORY_ICONS[icon] ?? Sparkles;
  return <Icon className={className} aria-hidden />;
}

/**
 * Caminhos SVG (24×24, traço) para desenhar os pinos do mapa sem React.
 * Mantidos em sincronia com os ícones lucide acima.
 */
export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

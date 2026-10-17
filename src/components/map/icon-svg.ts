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
  type IconNode,
} from "lucide";

/** Ícones de categoria como SVG em texto (para pinos do mapa, sem React). */
const NODES: Record<string, IconNode> = {
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

const esc = (v: string | number) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function iconSvg(name: string, size = 18, strokeWidth = 2.25): string {
  const node = NODES[name] ?? Sparkles;
  const children = node
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs ?? {}).map(([k, v]) => `${k}="${esc(v as string)}"`).join(" ")}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

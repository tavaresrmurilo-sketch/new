import { normalizeSearch } from "@/lib/text";
import { formatBRL } from "@/lib/money";
import type { ShippingProvider } from "./types";

function freeApplies(freeAboveCents: number | null, subtotalCents: number): boolean {
  return freeAboveCents != null && subtotalCents >= freeAboveCents;
}

export const pickupProvider: ShippingProvider = {
  method: "PICKUP",
  quote(config) {
    if (!config.pickup.enabled) return null;
    return {
      method: "PICKUP",
      label: "Retirada",
      description: "Sem custo. Combinamos local e horário pelo WhatsApp.",
      priceCents: 0,
      estimatedDays: 0,
      available: true,
      requiresAddress: false,
      free: true,
    };
  },
};

/** "Goiânia/GO" → { city: "goiania", state: "go" } */
function parseCityEntry(entry: string): { city: string; state: string } {
  const [city, state = ""] = entry.split("/");
  return { city: normalizeSearch(city), state: normalizeSearch(state) };
}

export function isLocalCity(cities: string[], city?: string, state?: string): boolean {
  if (!city) return false;
  const c = normalizeSearch(city);
  const s = normalizeSearch(state ?? "");
  return cities.some((entry) => {
    const parsed = parseCityEntry(entry);
    return parsed.city === c && (!parsed.state || !s || parsed.state === s);
  });
}

export const localDeliveryProvider: ShippingProvider = {
  method: "LOCAL_DELIVERY",
  quote(config, ctx) {
    const local = config.local;
    if (!local.enabled || local.cities.length === 0) return null;
    const free = freeApplies(local.freeAboveCents, ctx.subtotalCents);
    const available = isLocalCity(local.cities, ctx.city, ctx.state);
    return {
      method: "LOCAL_DELIVERY",
      label: "Entrega local",
      description: local.freeAboveCents != null && !free
        ? `Grátis a partir de ${formatBRL(local.freeAboveCents)}`
        : `Atendemos ${local.cities.join(", ")}`,
      priceCents: free ? 0 : local.priceCents,
      estimatedDays: local.estimatedDays,
      available,
      unavailableReason: available
        ? undefined
        : ctx.city
          ? `Entrega local disponível apenas em ${local.cities.join(", ")}`
          : "Informe o CEP para verificar a entrega local",
      requiresAddress: true,
      free,
    };
  },
};

export const nationalProvider: ShippingProvider = {
  method: "NATIONAL",
  quote(config, ctx) {
    const national = config.national;
    if (!national.enabled) return null;
    const free = freeApplies(national.freeAboveCents, ctx.subtotalCents);
    return {
      method: "NATIONAL",
      label: "Envio para todo o Brasil",
      description: national.freeAboveCents != null && !free
        ? `Grátis a partir de ${formatBRL(national.freeAboveCents)}`
        : "Enviado com código de rastreio",
      priceCents: free ? 0 : national.priceCents,
      estimatedDays: national.estimatedDays,
      available: true,
      requiresAddress: true,
      free,
    };
  },
};

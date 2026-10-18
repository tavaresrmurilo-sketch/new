"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { UserPosition } from "@/components/map/user-location";
import { getCurrentPosition, isNativeApp, LocationError } from "@/lib/native";

export type GeoStatus = "idle" | "locating" | "active";

function friendlyError(err: LocationError | null): { title: string; description: string } {
  if (!err) return { title: "Seu navegador não informa a localização", description: "Use a busca para encontrar sua cidade ou bairro." };
  if (err.code === "denied") {
    return {
      title: "Sem permissão para ver sua localização",
      description: isNativeApp()
        ? "Libere a localização para o Mixtour nos ajustes do aparelho e tente de novo — ou busque sua cidade."
        : "Libere o acesso à localização para o Mixtour nas configurações do navegador e tente de novo — ou busque sua cidade.",
    };
  }
  if (err.code === "timeout") return { title: "Demorou demais para encontrar você", description: "Confira o GPS ou a conexão e tente de novo." };
  return { title: "Não conseguimos encontrar sua localização agora", description: "Tente de novo em instantes ou busque sua cidade." };
}

/**
 * Localização do usuário SOMENTE por ação explícita (botão "Perto de mim").
 * Erros viram avisos amigáveis; nada é enviado ao servidor além do uso nas consultas.
 */
export function useGeolocation() {
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const pending = useRef<Promise<UserPosition | null> | null>(null);

  const locate = useCallback((): Promise<UserPosition | null> => {
    if (pending.current) return pending.current;
    if (!isNativeApp() && (typeof navigator === "undefined" || !("geolocation" in navigator) || !window.isSecureContext)) {
      const e = friendlyError(null);
      toast.error(e.title, { description: e.description });
      return Promise.resolve(null);
    }
    setStatus("locating");
    // No app nativo usa o GPS do aparelho (plugin); no navegador, a API de geolocalização.
    pending.current = getCurrentPosition({ timeoutMs: 12_000, highAccuracy: true }).then(
      (pos) => {
        const p: UserPosition = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
        setPosition(p);
        setStatus("active");
        pending.current = null;
        return p;
      },
      (err: unknown) => {
        const e = friendlyError(err instanceof LocationError ? err : new LocationError("indisponível", "unavailable"));
        toast.error(e.title, { description: e.description });
        setStatus((s) => (s === "locating" ? (position ? "active" : "idle") : s));
        pending.current = null;
        return null;
      },
    );
    return pending.current;
  }, [position]);

  return { position, status, locate };
}

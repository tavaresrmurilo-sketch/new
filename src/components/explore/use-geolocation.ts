"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { UserPosition } from "@/components/map/user-location";

export type GeoStatus = "idle" | "locating" | "active";

function friendlyError(err: GeolocationPositionError | null): { title: string; description: string } {
  if (!err) return { title: "Seu navegador não informa a localização", description: "Use a busca para encontrar sua cidade ou bairro." };
  if (err.code === err.PERMISSION_DENIED) {
    return {
      title: "Sem permissão para ver sua localização",
      description: "Libere o acesso à localização para o Mixtour nas configurações do navegador e tente de novo — ou busque sua cidade.",
    };
  }
  if (err.code === err.TIMEOUT) return { title: "Demorou demais para encontrar você", description: "Confira o GPS ou a conexão e tente de novo." };
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
    if (typeof navigator === "undefined" || !("geolocation" in navigator) || !window.isSecureContext) {
      const e = friendlyError(null);
      toast.error(e.title, { description: e.description });
      return Promise.resolve(null);
    }
    setStatus("locating");
    pending.current = new Promise<UserPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p: UserPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
          setPosition(p);
          setStatus("active");
          pending.current = null;
          resolve(p);
        },
        (err) => {
          const e = friendlyError(err);
          toast.error(e.title, { description: e.description });
          setStatus((s) => (s === "locating" ? (position ? "active" : "idle") : s));
          pending.current = null;
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
      );
    });
    return pending.current;
  }, [position]);

  return { position, status, locate };
}

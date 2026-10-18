"use client";

import { useEffect } from "react";

const DEDUP_MS = 30 * 60_000;

/**
 * Conta a visualização da página do evento depois de ~1 s com a aba visível
 * (ignora aberturas em segundo plano e recarregamentos seguidos na mesma aba).
 */
export function ViewTracker({ eventId, delayMs = 1000 }: { eventId: string; delayMs?: number }) {
  useEffect(() => {
    const key = `mx:view:${eventId}`;
    try {
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (last && Date.now() - last < DEDUP_MS) return;
    } catch {
      /* sessionStorage indisponível (modo privado): segue sem dedup local */
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      fetch(`/api/events/${encodeURIComponent(eventId)}/view`, { method: "POST", credentials: "same-origin", keepalive: true })
        .then((res) => {
          if (!res.ok) return;
          try {
            sessionStorage.setItem(key, String(Date.now()));
          } catch {
            /* ignora */
          }
        })
        .catch(() => {});
    };
    const arm = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible") timer = setTimeout(send, delayMs);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [eventId, delayMs]);

  return null;
}

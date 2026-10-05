"use client";

import { useEffect, useRef } from "react";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Atalhos de teclado. Aceita "mod+k" (Ctrl/Cmd), teclas simples ("c", "?") e sequências ("g d").
 * Teclas simples e sequências são ignoradas enquanto o usuário digita em um campo.
 */
export function useHotkeys(bindings: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    let prefix: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      if (mod) {
        const handler = ref.current[`mod+${key}`];
        if (handler) {
          e.preventDefault();
          handler(e);
        }
        return;
      }
      if (e.altKey || isTyping(e.target)) return;
      if (prefix) {
        const handler = ref.current[`${prefix} ${key}`];
        prefix = null;
        if (timer) clearTimeout(timer);
        if (handler) {
          e.preventDefault();
          handler(e);
          return;
        }
      }
      if (Object.keys(ref.current).some((k) => k.startsWith(`${key} `))) {
        prefix = key;
        timer = setTimeout(() => (prefix = null), 900);
        return;
      }
      const handler = ref.current[e.key === "?" ? "?" : key];
      if (handler) {
        e.preventDefault();
        handler(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

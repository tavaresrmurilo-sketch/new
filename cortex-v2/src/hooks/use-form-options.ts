"use client";

import { useEffect, useState } from "react";
import { getFormOptionsAction, type FormOptions } from "@/features/shared/actions";

let cache: { at: number; data: FormOptions } | null = null;
let inflight: Promise<FormOptions | null> | null = null;

async function load(): Promise<FormOptions | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  inflight ??= getFormOptionsAction({}).then((r) => {
    inflight = null;
    if (r.ok) {
      cache = { at: Date.now(), data: r.data };
      return r.data;
    }
    return null;
  });
  return inflight;
}

export function invalidateFormOptions() {
  cache = null;
}

/** Opções compartilhadas pelos formulários (membros, etapas, projetos, tags), com cache de 60 s. */
export function useFormOptions() {
  const [options, setOptions] = useState<FormOptions | null>(cache?.data ?? null);
  useEffect(() => {
    let alive = true;
    void load().then((d) => alive && d && setOptions(d));
    return () => {
      alive = false;
    };
  }, []);
  return options;
}

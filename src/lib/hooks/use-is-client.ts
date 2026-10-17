"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** true somente após a hidratação (evita divergência servidor/cliente). */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

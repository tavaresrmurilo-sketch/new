import { useCallback, useEffect, useRef, useState } from "react";
import { runtime } from "./runtime";
import { useStore } from "./state/store";

/** Load data over RPC; re-runs when deps change or the connection comes back. */
export function useRpc<T>(method: string, params: Record<string, unknown>, deps: unknown[]): {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => void;
} {
  const conn = useStore((s) => s.conn);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (conn !== "online") return;
    let alive = true;
    setLoading(true);
    runtime
      .rpc<T>(method, paramsRef.current)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError("");
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, conn, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** Run an RPC action with toast feedback. */
export async function act<T>(fn: () => Promise<T>, success?: string): Promise<T | null> {
  try {
    const res = await fn();
    if (success) useStore.getState().toast({ kind: "success", title: success });
    return res;
  } catch (e) {
    useStore.getState().toast({ kind: "error", title: "Não foi possível concluir", body: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/types/action";

/**
 * Executa uma Server Action com feedback padronizado: loading, prevenção de envio duplicado,
 * toast de sucesso/erro e atualização da página.
 */
export function useAction<I, O>(
  action: (input: I) => Promise<ActionResult<O>>,
  opts: { success?: string | ((data: O) => string); onSuccess?: (data: O) => void; onError?: (r: Extract<ActionResult<O>, { ok: false }>) => void; refresh?: boolean } = {},
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const inFlight = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const run = useCallback(
    async (input: I): Promise<ActionResult<O>> => {
      if (inFlight.current) return { ok: false, error: "Operação em andamento." };
      inFlight.current = true;
      setRunning(true);
      try {
        const result = await action(input);
        const o = optsRef.current;
        if (result.ok) {
          const msg = typeof o.success === "function" ? o.success(result.data) : o.success;
          if (msg) toast.success(msg);
          o.onSuccess?.(result.data);
          if (o.refresh !== false) startTransition(() => router.refresh());
        } else {
          toast.error(result.error);
          o.onError?.(result);
        }
        return result;
      } catch {
        toast.error("Falha de conexão. Verifique sua internet e tente novamente.");
        return { ok: false, error: "network" };
      } finally {
        inFlight.current = false;
        setRunning(false);
      }
    },
    [action, router],
  );

  return { run, pending: running || pending };
}

"use client";

import { toast } from "sonner";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

/** Chamada JSON às rotas internas com tratamento de erro padronizado. */
export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown; silent?: boolean }): Promise<T> {
  const { json, silent, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: { path: string; message: string }[] };
  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/login?expired=1";
    }
    const err = new ApiError(data.error ?? "Não foi possível concluir a operação.", res.status, data.issues);
    if (!silent) toast.error(err.message, { description: data.issues?.map((i) => i.message).join(" · ") });
    throw err;
  }
  return data as T;
}

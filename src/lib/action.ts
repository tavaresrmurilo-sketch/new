/** Resultado padrão das Server Actions (consumido com useActionState). */
export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "success"; message?: string; data?: T }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

export const idle: ActionState = { status: "idle" };

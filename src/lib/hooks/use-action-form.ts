"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Liga um formulário a uma Server Action SEM o reset automático do React 19
 * (que apagaria o que a pessoa digitou quando a validação falha).
 * Use: <form onSubmit={onSubmit}> e <SubmitButton pending={pending}>.
 */
export function useActionForm<S>(action: (prev: S, fd: FormData) => Promise<S>, initial: S) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, onSubmit, pending, dispatch };
}

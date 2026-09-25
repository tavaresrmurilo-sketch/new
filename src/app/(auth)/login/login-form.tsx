"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";

export function LoginForm({ expired }: { expired: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await api<{ redirect: string }>("/api/auth/login", { method: "POST", json: { email: form.get("email"), password: form.get("password") }, silent: true });
      window.location.href = res.redirect;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao entrar.");
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={submit} className="space-y-4">
        {expired ? <Notice tone="warning">Sua sessão expirou por inatividade. Entre novamente.</Notice> : null}
        {error ? <Notice tone="critical">{error}</Notice> : null}
        <Field label="E-mail">
          <Input name="email" type="email" autoComplete="email" required placeholder="voce@email.com" />
        </Field>
        <Field label="Senha">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>
      <div className="mt-8 border-t text-center">
        <p className="pt-6 text-sm text-muted-foreground">Ainda não possui conta?</p>
        <Button asChild variant="outline" className="mt-3 h-10 w-full">
          <Link href="/registrar">Criar conta</Link>
        </Button>
      </div>
    </div>
  );
}

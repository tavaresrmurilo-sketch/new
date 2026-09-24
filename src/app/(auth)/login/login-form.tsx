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
    <form onSubmit={submit} className="mt-6 space-y-4">
      {expired ? <Notice tone="warning">Sua sessão expirou por inatividade. Entre novamente.</Notice> : null}
      {error ? <Notice tone="critical">{error}</Notice> : null}
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Nova empresa?{" "}
        <Link href="/registrar" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Ambiente de demonstração</p>
        <p className="mt-1">admin@demo.jrcortex.com.br · senha definida no seed (padrão em README.md)</p>
      </div>
    </form>
  );
}

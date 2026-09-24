"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";

export function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIssues({});
    const f = new FormData(e.currentTarget);
    try {
      const res = await api<{ redirect: string }>("/api/auth/register", {
        method: "POST",
        silent: true,
        json: { companyName: f.get("companyName"), cnpj: f.get("cnpj") || undefined, name: f.get("name"), email: f.get("email"), password: f.get("password"), acceptTerms: f.get("acceptTerms") === "on" },
      });
      window.location.href = res.redirect;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(Object.fromEntries((err.issues ?? []).map((i) => [i.path, i.message])));
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {error ? <Notice tone="critical">{error}</Notice> : null}
      <Field label="Nome da empresa" error={issues.companyName}>
        <Input name="companyName" required minLength={2} />
      </Field>
      <Field label="CNPJ (opcional)" error={issues.cnpj}>
        <Input name="cnpj" placeholder="00.000.000/0000-00" />
      </Field>
      <Field label="Seu nome" error={issues.name}>
        <Input name="name" required />
      </Field>
      <Field label="E-mail corporativo" error={issues.email}>
        <Input name="email" type="email" required />
      </Field>
      <Field label="Senha" hint="Mínimo de 10 caracteres, com letras e números." error={issues.password}>
        <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5" />
        Li e aceito os termos de uso e a política de privacidade (LGPD). Os dados da empresa não são usados para treinar modelos externos.
      </label>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Criando..." : "Criar empresa e continuar"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

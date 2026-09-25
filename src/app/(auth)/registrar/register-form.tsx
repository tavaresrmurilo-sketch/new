"use client";

import { Building2, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type AccountType = "PERSON" | "COMPANY";

const PROFILES: { value: AccountType; label: string; hint: string; icon: typeof UserRound }[] = [
  { value: "PERSON", label: "Pessoa", hint: "Uso individual", icon: UserRound },
  { value: "COMPANY", label: "Empresa", hint: "Uso empresarial", icon: Building2 },
];

export function RegisterForm() {
  const [type, setType] = useState<AccountType>("PERSON");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIssues({});
    const f = new FormData(e.currentTarget);
    const common = { email: f.get("email"), password: f.get("password"), acceptTerms: f.get("acceptTerms") === "on" };
    const body =
      type === "PERSON"
        ? { accountType: type, firstName: f.get("firstName"), lastName: f.get("lastName"), ...common }
        : { accountType: type, companyName: f.get("companyName"), name: f.get("name"), cnpj: f.get("cnpj") || undefined, ...common };
    try {
      const res = await api<{ redirect: string }>("/api/auth/register", { method: "POST", silent: true, json: body });
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
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Escolha seu perfil</legend>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {PROFILES.map((p) => {
            const Icon = p.icon;
            const active = type === p.value;
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setType(p.value)}
                className={cn(
                  "flex flex-col items-start rounded-lg border bg-card p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary ring-1 ring-primary" : "hover:border-primary/40",
                )}
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-md", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-3 text-sm font-semibold">{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {error ? <Notice tone="critical">{error}</Notice> : null}

      {type === "PERSON" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" error={issues.firstName}>
            <Input name="firstName" required minLength={2} autoComplete="given-name" />
          </Field>
          <Field label="Sobrenome" error={issues.lastName}>
            <Input name="lastName" required minLength={2} autoComplete="family-name" />
          </Field>
        </div>
      ) : (
        <>
          <Field label="Nome da empresa" error={issues.companyName}>
            <Input name="companyName" required minLength={2} autoComplete="organization" />
          </Field>
          <Field label="Nome do responsável" error={issues.name}>
            <Input name="name" required minLength={2} autoComplete="name" />
          </Field>
          <Field label="CNPJ (opcional)" error={issues.cnpj}>
            <Input name="cnpj" placeholder="00.000.000/0000-00" />
          </Field>
        </>
      )}
      <Field label="E-mail" error={issues.email}>
        <Input name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Senha" hint="Mínimo de 10 caracteres, com letras e números." error={issues.password}>
        <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
      </Field>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="acceptTerms" required className="mt-0.5" />
        Li e aceito os termos de uso e a política de privacidade (LGPD).
      </label>
      <Button type="submit" className="h-10 w-full" disabled={loading}>
        {loading ? "Criando conta..." : "Criar conta"}
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

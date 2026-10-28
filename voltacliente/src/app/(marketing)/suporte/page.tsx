import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon, LifeBuoyIcon, MailIcon, ShieldCheckIcon } from "lucide-react";
import { Faq } from "@/components/marketing/faq";

export const metadata: Metadata = { title: "Suporte" };

export default function SupportPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return (
    <div className="container-page max-w-4xl py-16">
      <div className="text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-primary">
          <LifeBuoyIcon className="size-6" />
        </span>
        <h1 className="mt-4 text-3xl font-bold sm:text-4xl">Como podemos ajudar?</h1>
        <p className="mt-3 text-muted-foreground">Respostas rápidas para as dúvidas mais comuns e o canal para falar com a equipe.</p>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5">
          <MailIcon className="size-5 text-primary" />
          <h2 className="mt-3 font-semibold">Fale com a equipe</h2>
          {email ? (
            <a href={`mailto:${email}`} className="mt-1 block text-sm break-all text-primary hover:underline">
              {email}
            </a>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">O e-mail de suporte será divulgado no lançamento comercial.</p>
          )}
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <BookOpenIcon className="size-5 text-primary" />
          <h2 className="mt-3 font-semibold">Primeiros passos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre serviços, importe clientes e registre o último atendimento de cada um.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <ShieldCheckIcon className="size-5 text-primary" />
          <h2 className="mt-3 font-semibold">Privacidade</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Veja a{" "}
            <Link href="/privacidade" className="text-primary hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
      </div>
      <div className="mt-12">
        <h2 className="mb-6 text-2xl font-bold">Perguntas frequentes</h2>
        <Faq />
      </div>
    </div>
  );
}

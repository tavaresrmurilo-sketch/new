"use client";

import { Download, TriangleAlert, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { fieldError, FormMessage } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { idle, type ActionState } from "@/lib/action";

/** "Baixar meus dados": baixa o JSON de /api/me/export e mostra erros (ex.: limite por hora) sem sair da página. */
export function ExportDataButton() {
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/export", { headers: { accept: "application/json" } });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error ?? "Não foi possível gerar o arquivo agora.");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "mixtour-meus-dados.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success("Arquivo gerado", { description: "Seus dados foram baixados em formato JSON." });
    } catch {
      toast.error("Sem conexão. Verifique a internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant="secondary" onClick={download} loading={loading} className="w-full sm:w-auto">
      <Download /> Baixar meus dados
    </Button>
  );
}

export interface BlockingOrg {
  id: string;
  name: string;
  slug: string;
}

/** Exclusão da conta: bloqueio por única proprietária, confirmação por senha (ou EXCLUIR) e saída da sessão. */
export function DeleteAccountSection({ hasPassword, blocking }: { hasPassword: boolean; blocking: BlockingOrg[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ActionState>(idle);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      const res = await fetch("/api/me/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") }),
      });
      const data = (await res.json().catch(() => null)) as ActionState | null;
      if (!res.ok || !data || data.status !== "success") {
        setState(data && data.status === "error" ? data : { status: "error", message: "Não foi possível excluir a conta agora. Tente de novo em instantes." });
        if (data?.status === "error" && data.fieldErrors?.blocked) router.refresh();
        return;
      }
      setState(data);
      toast.success("Sua conta foi excluída", { description: "Seus dados pessoais foram apagados. Obrigado por ter feito parte do Mixtour.", duration: 8000 });
      router.replace("/");
      router.refresh();
    } catch {
      setState({ status: "error", message: "Sem conexão. Verifique a internet e tente de novo." });
    } finally {
      setPending(false);
    }
  };

  if (blocking.length) {
    return (
      <div className="rounded-2xl border border-warning/25 bg-warning-soft p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-warning">
          <TriangleAlert className="size-4" aria-hidden /> Antes de excluir, resolva suas organizações
        </p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          Você é a única pessoa proprietária de{" "}
          {blocking.map((o, i) => (
            <span key={o.id}>
              {i > 0 && (i === blocking.length - 1 ? " e " : ", ")}
              <strong>{o.name}</strong>
            </span>
          ))}
          . Para não deixar a organização sem responsável, transfira a propriedade para outra pessoa da equipe em <strong>Painel → Equipe</strong> ou encerre a
          organização. Depois, volte aqui.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm" className="h-10">
            <Link href="/painel/equipe">Ir para Painel → Equipe</Link>
          </Button>
          <Button variant="ghost" size="sm" className="h-10" disabled>
            <Trash /> Excluir minha conta
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant="danger-soft" className="w-full sm:w-auto">
          <Trash /> Excluir minha conta
        </Button>
      </DialogTrigger>
      <DialogContent title="Excluir sua conta?" description="Esta ação é definitiva e não pode ser desfeita.">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          <ul className="space-y-2 rounded-2xl bg-danger-soft p-4 text-sm leading-relaxed text-foreground/85">
            <li>• Seu nome, e-mail, foto, cidade e preferências serão apagados.</li>
            <li>• Sua agenda (salvos e presenças), quem você segue e suas notificações serão removidos.</li>
            <li>• Você sai das equipes de organizações e todas as sessões são encerradas.</li>
            <li>• Registros de segurança são mantidos sem seus dados pessoais, como exige a lei.</li>
          </ul>
          {hasPassword ? (
            <Field label="Digite sua senha para confirmar" htmlFor="delete-password" error={fieldError(state, "password")}>
              <Input id="delete-password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(fieldError(state, "password")) || undefined} />
            </Field>
          ) : (
            <Field label="Digite EXCLUIR para confirmar" htmlFor="delete-confirm" error={fieldError(state, "confirm")} hint="Sua conta usa login com Google, então confirmamos assim.">
              <Input id="delete-confirm" name="confirm" autoComplete="off" autoCapitalize="characters" required aria-invalid={Boolean(fieldError(state, "confirm")) || undefined} />
            </Field>
          )}
          {state.status === "error" && !fieldError(state, "password") && !fieldError(state, "confirm") && <FormMessage state={state} />}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton pending={pending} variant="danger">
              Excluir definitivamente
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Check, Copy, Loader2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { reportPayment, submitReview, verifyOrderAccess } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export function CopyButton({ value, label, variant = "primary", className }: { value: string; label: string; variant?: "primary" | "outline" | "dark"; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Navegadores sem permissão de área de transferência: seleciona o texto para cópia manual
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    toast.success("Código Pix copiado. Agora é só colar no app do banco.");
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <Button variant={variant} size="lg" onClick={copy} className={className}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiado!" : label}
    </Button>
  );
}

export function ReportPaymentButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="dark"
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const result = await reportPayment(code);
        setBusy(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      }}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      Já fiz o pagamento
    </Button>
  );
}

export function OrderAccessForm({ initialCode = "", redirectTo }: { initialCode?: string; redirectTo?: (code: string) => string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const result = await verifyOrderAccess({ code, contact });
        setBusy(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const target = redirectTo ? redirectTo(result.code!) : `/pedido/${result.code}`;
        router.push(target);
        router.refresh();
      }}
    >
      <Field label="Código do pedido" htmlFor="track-code" hint="Está na tela do pedido e na mensagem de confirmação. Ex.: CHX-A82F91">
        <Input
          id="track-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CHX-"
          autoCapitalize="characters"
          autoComplete="off"
          className="font-mono uppercase"
          required
        />
      </Field>
      <Field label="E-mail ou telefone usado na compra" htmlFor="track-contact">
        <Input id="track-contact" value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" required />
      </Field>
      {error && (
        <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Ver meu pedido
      </Button>
    </form>
  );
}

export function ReviewForm({ code }: { code: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const result = await submitReview({ code, rating, comment });
        setBusy(false);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success("Obrigado pela avaliação!");
        router.refresh();
      }}
    >
      <fieldset>
        <legend className="text-sm font-medium">Sua nota</legend>
        <div className="mt-2 flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => setRating(n)}>
              <Star className={cn("h-7 w-7", n <= rating ? "fill-ink text-ink" : "text-line-strong")} />
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Conte como foi" htmlFor="review-comment" hint="Sua avaliação aparece na loja depois de revisada, só com seu primeiro nome.">
        <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={600} required />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Enviar avaliação
      </Button>
    </form>
  );
}

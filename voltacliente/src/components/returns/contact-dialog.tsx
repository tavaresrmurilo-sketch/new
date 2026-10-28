"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2Icon, ExternalLinkIcon, InfoIcon, LoaderCircleIcon, ShieldAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { whatsappDecision } from "@/lib/contact-policy";
import { whatsappUrl } from "@/lib/phone";
import { buildTemplateValues, renderTemplate, TEMPLATE_MAX_LENGTH } from "@/lib/templates";
import { setCustomerConsentAction } from "@/modules/customers/actions";
import { getContactContextAction, logWhatsAppOpenedAction, markContactedAction } from "@/modules/returns/actions";
import { WhatsAppIcon } from "./whatsapp-icon";

type Context = Extract<Awaited<ReturnType<typeof getContactContextAction>>, { ok: true }>["data"];

/**
 * Envio assistido: prepara a mensagem, abre o WhatsApp e pede confirmação
 * manual. Abrir o WhatsApp não é registrado como contato realizado.
 */
export function ContactDialog({
  reminderId,
  open,
  onOpenChange,
}: {
  reminderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open && <ContactDialogBody reminderId={reminderId} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ContactDialogBody({ reminderId, onOpenChange }: { reminderId: string; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [context, setContext] = useState<Context | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(result: Awaited<ReturnType<typeof getContactContextAction>>) {
    if (!result.ok) return setLoadError(result.error);
    setLoadError(null);
    setContext(result.data);
    const initial = result.data.templates.find((t) => t.id === result.data.suggestedTemplateId) ?? result.data.templates[0];
    setTemplateId(initial?.id ?? "");
    setMessage(initial ? renderTemplate(initial.body, valuesFor(result.data)) : "");
  }

  useEffect(() => {
    getContactContextAction(reminderId).then(apply);
  }, [reminderId]);

  const decision = useMemo(() => (context ? whatsappDecision(context.customer) : null), [context]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = context?.templates.find((t) => t.id === id);
    if (template && context) setMessage(renderTemplate(template.body, valuesFor(context)));
  }

  function recordConsent() {
    if (!context) return;
    startTransition(async () => {
      const result = await setCustomerConsentAction(context.customer.id, true);
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.message);
      apply(await getContactContextAction(reminderId));
      router.refresh();
    });
  }

  function confirmSent() {
    startTransition(async () => {
      const result = await markContactedAction(reminderId, {
        channel: "WHATSAPP",
        outcome: "MESSAGE_SENT",
        message,
      });
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.message);
      onOpenChange(false);
      router.refresh();
    });
  }

  const url = context && message.trim() ? whatsappUrl(context.customer.phoneNormalized, message.trim()) : "#";

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <WhatsAppIcon className="size-5 text-emerald" /> Enviar WhatsApp
        </DialogTitle>
        <DialogDescription>
          {context ? `${context.customer.name} · ${context.customer.phone}` : "Preparando a mensagem..."}
        </DialogDescription>
      </DialogHeader>

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : !context ? (
        <div className="space-y-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-36" />
        </div>
      ) : opened ? (
        <div className="space-y-4">
          <Alert variant="info">
            <InfoIcon />
            <AlertTitle>O WhatsApp foi aberto em outra aba</AlertTitle>
            <AlertDescription>
              <p>Abrir o WhatsApp não envia a mensagem. Confirme abaixo somente depois de enviá-la.</p>
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpened(false)} disabled={pending}>
              Ainda não enviei
            </Button>
            <Button variant="emerald" onClick={confirmSent} disabled={pending}>
              {pending ? <LoaderCircleIcon className="animate-spin" /> : <CheckCircle2Icon />}
              Enviei — marcar como contatado
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-4">
          {decision && !decision.allowed && (
            <Alert variant="warning">
              <ShieldAlertIcon />
              <AlertTitle>Envio bloqueado</AlertTitle>
              <AlertDescription>
                <p>{decision.reason}</p>
                {!context.customer.doNotContact && !context.customer.marketingConsent && (
                  <Button size="sm" variant="outline" className="mt-2" onClick={recordConsent} disabled={pending}>
                    O cliente autorizou — registrar consentimento
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="template">Modelo</Label>
            <Select value={templateId} onValueChange={chooseTemplate}>
              <SelectTrigger id="template">
                <SelectValue placeholder="Escolha um modelo" />
              </SelectTrigger>
              <SelectContent>
                {context.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? " (padrão)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="message" className="justify-between">
              Mensagem (revise antes de enviar)
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {message.length}/{TEMPLATE_MAX_LENGTH}
              </span>
            </Label>
            <Textarea
              id="message"
              rows={6}
              maxLength={TEMPLATE_MAX_LENGTH}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="leading-relaxed"
            />
          </div>
          <div className="rounded-xl bg-[#e7f6ee] p-3 dark:bg-emerald-soft">
            <p className="mb-1 text-[11px] font-medium tracking-wide text-emerald-soft-foreground uppercase">Pré-visualização</p>
            <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-white px-3 py-2 text-sm whitespace-pre-line text-slate-900 shadow-sm dark:bg-card dark:text-card-foreground">
              {message || "…"}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {decision?.allowed && message.trim() ? (
              <Button asChild variant="emerald">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void logWhatsAppOpenedAction(reminderId);
                    setOpened(true);
                  }}
                >
                  <WhatsAppIcon className="size-4" /> Abrir WhatsApp <ExternalLinkIcon />
                </a>
              </Button>
            ) : (
              <Button variant="emerald" disabled>
                <WhatsAppIcon className="size-4" /> Abrir WhatsApp
              </Button>
            )}
          </DialogFooter>
        </div>
      )}
    </>
  );
}

function valuesFor(context: Context) {
  return buildTemplateValues({
    customerName: context.customer.name,
    companyName: context.company.name,
    companyPhone: context.company.phone,
    serviceName: context.serviceName,
    lastServiceDate: context.lastAppointmentDate,
    recommendedDate: context.recommendedDate,
    today: context.today,
  });
}

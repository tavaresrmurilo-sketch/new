"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_PREFERENCE_LABEL } from "@/lib/contact-policy";
import { saveCustomerAction } from "@/modules/customers/actions";
import { CONTACT_PREFERENCES, customerSchema, type CustomerInput } from "@/modules/customers/schema";

export type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  notes: string;
  registeredAt: string;
  contactPreference: (typeof CONTACT_PREFERENCES)[number];
  marketingConsent: boolean;
  doNotContact: boolean;
};

export function CustomerForm({ id, initial, today }: { id?: string; initial?: CustomerFormValues; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preference, setPreference] = useState(initial?.contactPreference ?? "WHATSAPP");
  const [consent, setConsent] = useState(initial?.marketingConsent ?? false);
  const [doNotContact, setDoNotContact] = useState(initial?.doNotContact ?? false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "");
    const values: CustomerInput = {
      name: text("name"),
      phone: text("phone"),
      email: text("email"),
      notes: text("notes"),
      registeredAt: text("registeredAt"),
      contactPreference: preference,
      marketingConsent: consent,
      doNotContact,
    };
    const parsed = customerSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await saveCustomerAction(id ?? null, values);
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      toast.success(result.message);
      router.push(`/clientes/${result.data.id}`);
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome" htmlFor="name" error={errors.name} className="sm:col-span-2">
              <Input id="name" name="name" defaultValue={initial?.name} autoComplete="off" aria-invalid={!!errors.name} autoFocus={!id} />
            </Field>
            <Field label="Telefone / WhatsApp" htmlFor="phone" error={errors.phone} hint="Com DDD. Ex.: (11) 98765-4321">
              <Input id="phone" name="phone" inputMode="tel" defaultValue={initial?.phone} aria-invalid={!!errors.phone} />
            </Field>
            <Field label="E-mail" htmlFor="email" error={errors.email} optional>
              <Input id="email" name="email" type="email" defaultValue={initial?.email} aria-invalid={!!errors.email} />
            </Field>
            <Field
              label="Cliente desde"
              htmlFor="registeredAt"
              error={errors.registeredAt}
              hint="Data de cadastro do cliente na sua empresa."
            >
              <Input id="registeredAt" name="registeredAt" type="date" max={today} defaultValue={initial?.registeredAt ?? today} />
            </Field>
            <Field label="Preferência de contato" htmlFor="contactPreference" error={errors.contactPreference}>
              <Select value={preference} onValueChange={(v) => setPreference(v as typeof preference)}>
                <SelectTrigger id="contactPreference">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_PREFERENCES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {CONTACT_PREFERENCE_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Observações" htmlFor="notes" error={errors.notes} optional className="sm:col-span-2">
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                defaultValue={initial?.notes}
                placeholder="Ex.: equipamento split 12.000 BTUs na sala"
              />
            </Field>
          </div>

          <fieldset className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <legend className="px-1 text-sm font-semibold">Privacidade e consentimento</legend>
            <div className="flex items-start gap-3">
              <Checkbox
                id="marketingConsent"
                checked={consent && !doNotContact}
                disabled={doNotContact}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="marketingConsent" className="block leading-relaxed font-normal">
                <span className="font-medium">O cliente autorizou receber mensagens</span>
                <span className="block text-[13px] text-muted-foreground">
                  Lembretes de retorno e ofertas pelo canal preferido. Sem essa autorização, o envio pelo WhatsApp fica bloqueado.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Switch id="doNotContact" checked={doNotContact} onCheckedChange={setDoNotContact} className="mt-0.5" />
              <Label htmlFor="doNotContact" className="block leading-relaxed font-normal">
                <span className="font-medium">Não contatar</span>
                <span className="block text-[13px] text-muted-foreground">
                  O cliente pediu para não receber mensagens. Todos os envios ficam bloqueados.
                </span>
              </Label>
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
              Cancelar
            </Button>
            <SubmitButton pending={pending} pendingLabel="Salvando...">
              {id ? "Salvar alterações" : "Cadastrar cliente"}
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENT_INFO, SEGMENTS, TIMEZONES, type SegmentKey } from "@/lib/segments";
import { updateCompanyAction } from "@/modules/company/actions";
import { companySettingsSchema } from "@/modules/company/schema";

type Values = { name: string; segment: SegmentKey; phone: string; timezone: string; defaultReturnIntervalDays: string };

export function CompanyForm({ initial, canEdit }: { initial: Values; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const set = (key: keyof Values) => (value: string) => setValues((v) => ({ ...v, [key]: value }));
  const timezones = TIMEZONES.some((t) => t.value === values.timezone)
    ? TIMEZONES
    : [{ value: values.timezone, label: values.timezone }, ...TIMEZONES];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = companySettingsSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await updateCompanyAction(values);
      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Dados da empresa</CardTitle>
        <CardDescription>
          Usados nas mensagens ({"{empresa}"}, {"{telefone_empresa}"}) e no cálculo de datas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <fieldset disabled={!canEdit || pending} className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome da empresa" htmlFor="name" error={errors.name} className="sm:col-span-2">
              <Input id="name" value={values.name} onChange={(e) => set("name")(e.target.value)} />
            </Field>
            <Field label="Segmento" htmlFor="segment" error={errors.segment}>
              <Select value={values.segment} onValueChange={set("segment")}>
                <SelectTrigger id="segment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEGMENT_INFO[s].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Telefone comercial" htmlFor="phone" error={errors.phone}>
              <Input id="phone" inputMode="tel" value={values.phone} onChange={(e) => set("phone")(e.target.value)} />
            </Field>
            <Field label="Fuso horário" htmlFor="timezone" error={errors.timezone} hint="Define o que é “hoje” na central de retornos.">
              <Select value={values.timezone} onValueChange={set("timezone")}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Periodicidade padrão (dias)"
              htmlFor="interval"
              error={errors.defaultReturnIntervalDays}
              hint="Para serviços sem intervalo próprio."
            >
              <Input
                id="interval"
                inputMode="numeric"
                value={values.defaultReturnIntervalDays}
                onChange={(e) => set("defaultReturnIntervalDays")(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </fieldset>
          {canEdit ? (
            <div className="flex justify-end border-t pt-5">
              <SubmitButton pending={pending} pendingLabel="Salvando...">
                Salvar alterações
              </SubmitButton>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Apenas administradores podem alterar estes dados.</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BellRingIcon, CalendarCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { computeNextReturnDate, diffInDays, formatDate, isISODate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { saveAppointmentAction } from "@/modules/appointments/actions";
import { appointmentSchema, type ReturnMode } from "@/modules/appointments/schema";
import { CustomerPicker, type PickedCustomer } from "./customer-picker";

export type ServiceOption = { id: string; name: string; returnIntervalDays: number | null; defaultPriceCents: number | null };

export type AppointmentFormInitial = {
  customer: PickedCustomer | null;
  serviceId: string;
  date: string;
  amount: string;
  notes: string;
  returnMode: ReturnMode;
  nextReturnDate: string;
};

const MODES: { value: ReturnMode; label: string; hint: string }[] = [
  { value: "auto", label: "Automático", hint: "Pelo intervalo do serviço" },
  { value: "manual", label: "Escolher data", hint: "Ajuste manual" },
  { value: "none", label: "Sem retorno", hint: "Não lembrar" },
];

export function AppointmentForm({
  id,
  initial,
  services,
  defaultIntervalDays,
  today,
  fromReminder,
}: {
  id?: string;
  initial: AppointmentFormInitial;
  services: ServiceOption[];
  defaultIntervalDays: number;
  today: string;
  fromReminder?: { id: string; serviceName: string; lastAppointmentDate: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customer, setCustomer] = useState<PickedCustomer | null>(initial.customer);
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const [date, setDate] = useState(initial.date);
  const [amount, setAmount] = useState(initial.amount);
  const [returnMode, setReturnMode] = useState<ReturnMode>(initial.returnMode);
  const [nextReturnDate, setNextReturnDate] = useState(initial.nextReturnDate);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const interval = service?.returnIntervalDays ?? defaultIntervalDays;
  const autoDate = useMemo(() => (isISODate(date) ? computeNextReturnDate(date, interval) : null), [date, interval]);

  function chooseService(next: string) {
    setServiceId(next);
    const chosen = services.find((s) => s.id === next);
    if (!amount && chosen?.defaultPriceCents != null) setAmount(centsToInput(chosen.defaultPriceCents));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      customerId: customer?.id ?? "",
      serviceId,
      date,
      amount,
      notes: String(form.get("notes") ?? ""),
      returnMode,
      nextReturnDate: returnMode === "manual" ? nextReturnDate : null,
      fromReminderId: fromReminder?.id ?? null,
    };
    const parsed = appointmentSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.path[0] === "customerId" ? "Escolha o cliente." : i.message]),
        ),
      );
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await saveAppointmentAction(id ?? null, values);
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      toast.success(result.message);
      router.push(fromReminder ? "/retornos?aba=convertidos" : `/clientes/${result.data.customerId}`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          {fromReminder && (
            <Alert variant="success">
              <BellRingIcon />
              <AlertDescription>
                Registrando o retorno do cliente. Último atendimento: {fromReminder.serviceName} em{" "}
                {formatDate(fromReminder.lastAppointmentDate)}.
              </AlertDescription>
            </Alert>
          )}
          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <Field label="Cliente" htmlFor="customer" error={errors.customerId}>
            <CustomerPicker value={customer} onChange={setCustomer} locked={Boolean(id || fromReminder)} invalid={!!errors.customerId} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Serviço" htmlFor="serviceId" error={errors.serviceId} className="sm:col-span-3">
              <Select value={serviceId} onValueChange={chooseService}>
                <SelectTrigger id="serviceId" aria-invalid={!!errors.serviceId}>
                  <SelectValue placeholder="Escolha o serviço realizado" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · retorno em {s.returnIntervalDays ?? defaultIntervalDays} dias
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Data do atendimento" htmlFor="date" error={errors.date}>
              <Input
                id="date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!errors.date}
              />
            </Field>
            <Field label="Valor cobrado (R$)" htmlFor="amount" error={errors.amount} optional>
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                aria-invalid={!!errors.amount}
              />
            </Field>
          </div>

          <Field label="Observações" htmlFor="notes" error={errors.notes} optional>
            <Textarea id="notes" name="notes" rows={3} defaultValue={initial.notes} placeholder="Ex.: troca do filtro, peças utilizadas" />
          </Field>

          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Próximo retorno</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Próximo retorno">
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  role="radio"
                  aria-checked={returnMode === mode.value}
                  onClick={() => {
                    setReturnMode(mode.value);
                    if (mode.value === "manual" && !nextReturnDate && autoDate) setNextReturnDate(autoDate);
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent/60",
                    returnMode === mode.value && "border-primary bg-accent ring-2 ring-primary/15",
                  )}
                >
                  <span className="block text-sm font-medium">{mode.label}</span>
                  <span className="block text-xs text-muted-foreground">{mode.hint}</span>
                </button>
              ))}
            </div>
            {returnMode === "auto" && (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-soft/50 px-3 py-2 text-sm text-emerald-soft-foreground">
                <CalendarCheckIcon className="size-4 shrink-0" />
                {autoDate && service ? (
                  <span>
                    Retorno sugerido para <strong>{formatDate(autoDate)}</strong> ({interval} dias após o atendimento).
                  </span>
                ) : (
                  <span>Escolha o serviço e a data para calcular o retorno.</span>
                )}
              </p>
            )}
            {returnMode === "manual" && (
              <Field
                label="Data do próximo retorno"
                htmlFor="nextReturnDate"
                error={errors.nextReturnDate}
                hint={
                  isISODate(nextReturnDate) && isISODate(date) ? `${diffInDays(nextReturnDate, date)} dias após o atendimento` : undefined
                }
                className="max-w-xs"
              >
                <Input
                  id="nextReturnDate"
                  type="date"
                  min={date}
                  value={nextReturnDate}
                  onChange={(e) => setNextReturnDate(e.target.value)}
                />
              </Field>
            )}
            {returnMode === "none" && <p className="text-sm text-muted-foreground">Nenhum lembrete será criado para este atendimento.</p>}
          </fieldset>

          <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
              Cancelar
            </Button>
            <SubmitButton pending={pending} pendingLabel="Salvando...">
              {id ? "Salvar alterações" : fromReminder ? "Registrar retorno" : "Registrar atendimento"}
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

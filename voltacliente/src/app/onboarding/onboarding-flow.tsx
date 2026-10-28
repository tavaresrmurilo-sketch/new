"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEGMENT_INFO, SEGMENTS, TIMEZONES, type SegmentKey } from "@/lib/segments";
import { cn } from "@/lib/utils";
import { completeOnboardingAction } from "@/modules/company/actions";
import { onboardingSchema } from "@/modules/company/schema";

type ServiceDraft = { key: number; name: string; returnIntervalDays: string };

const STEPS = ["Sua empresa", "Serviços", "Retornos"];
const INTERVAL_PRESETS = [15, 30, 60, 90, 180, 365];

const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const subscribeNothing = () => () => {};
function browserTimezone() {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.some((t) => t.value === detected) ? detected : DEFAULT_TIMEZONE;
}

let nextKey = 1;
const draftsFor = (segment: SegmentKey): ServiceDraft[] =>
  SEGMENT_INFO[segment].services.map((s) => ({ key: nextKey++, name: s.name, returnIntervalDays: String(s.returnIntervalDays) }));

export function OnboardingFlow({ userName }: { userName: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [segment, setSegment] = useState<SegmentKey | null>(null);
  const [phone, setPhone] = useState("");
  const detectedTimezone = useSyncExternalStore(subscribeNothing, browserTimezone, () => DEFAULT_TIMEZONE);
  const [chosenTimezone, setTimezone] = useState<string | null>(null);
  const timezone = chosenTimezone ?? detectedTimezone;
  const [services, setServices] = useState<ServiceDraft[]>([]);
  const [defaultInterval, setDefaultInterval] = useState("90");

  const firstName = useMemo(() => userName.split(" ")[0], [userName]);

  function chooseSegment(value: SegmentKey) {
    if (value !== segment) {
      setSegment(value);
      setServices(draftsFor(value));
      setDefaultInterval(String(SEGMENT_INFO[value].defaultIntervalDays));
    }
  }

  function payload() {
    return {
      companyName,
      segment: segment ?? undefined,
      phone,
      timezone,
      defaultReturnIntervalDays: defaultInterval,
      services: services.map((s) => ({ name: s.name, returnIntervalDays: s.returnIntervalDays })),
    };
  }

  function validate(currentStep: number): boolean {
    const result = onboardingSchema.safeParse(payload());
    const fieldsByStep: string[][] = [["companyName", "segment", "phone", "timezone"], ["services"], ["defaultReturnIntervalDays"]];
    const relevant = fieldsByStep.slice(0, currentStep + 1).flat();
    const next: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path.map(String).join(".");
        if (relevant.includes(String(issue.path[0])) && !next[key]) next[key] = issue.message;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goNext() {
    if (validate(step)) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step < STEPS.length - 1) return goNext();
    if (!validate(step)) return;
    setFormError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction(payload() as Parameters<typeof completeOnboardingAction>[0]);
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      toast.success("Tudo pronto! Sua empresa foi configurada.");
      router.replace("/painel");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-2xl animate-fade-up space-y-6">
      <div className="space-y-2 text-center">
        <p className="text-sm font-medium text-emerald">Olá, {firstName}!</p>
        <h1 className="text-2xl font-bold sm:text-3xl">Vamos configurar sua empresa</h1>
        <p className="text-muted-foreground">Leva menos de 2 minutos. Você pode ajustar tudo depois.</p>
      </div>

      <ol className="flex items-center justify-center gap-2 sm:gap-3" aria-label="Etapas">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                index < step && "border-emerald bg-emerald text-emerald-foreground",
                index === step && "border-primary bg-primary text-primary-foreground",
                index > step && "bg-card text-muted-foreground",
              )}
              aria-current={index === step ? "step" : undefined}
            >
              {index < step ? <CheckIcon className="size-4" /> : index + 1}
            </span>
            <span className={cn("hidden text-sm sm:inline", index === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {index < STEPS.length - 1 && <span className="h-px w-6 bg-border sm:w-10" />}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent>
          <form onSubmit={submit} className="space-y-6" noValidate>
            {step === 0 && (
              <div className="space-y-5">
                <Field label="Nome da empresa" htmlFor="companyName" error={errors.companyName}>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex.: ClimaTech Ar-Condicionado"
                    aria-invalid={!!errors.companyName}
                    autoFocus
                  />
                </Field>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Segmento</span>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Segmento">
                    {SEGMENTS.map((key) => {
                      const info = SEGMENT_INFO[key];
                      const Icon = info.icon;
                      const selected = segment === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => chooseSegment(key)}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-accent/50",
                            selected && "border-primary bg-accent ring-2 ring-primary/20",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted",
                              selected && "bg-primary text-primary-foreground",
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <span className="space-y-0.5">
                            <span className="block text-sm font-medium">{info.label}</span>
                            <span className="block text-xs text-muted-foreground">{info.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.segment && <p className="text-[13px] text-destructive">{errors.segment}</p>}
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Telefone comercial (WhatsApp)" htmlFor="phone" error={errors.phone}>
                    <Input
                      id="phone"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      aria-invalid={!!errors.phone}
                    />
                  </Field>
                  <Field label="Fuso horário" htmlFor="timezone" error={errors.timezone}>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger id="timezone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-semibold">Serviços mais comuns</h2>
                  <p className="text-sm text-muted-foreground">
                    Sugerimos alguns para o seu segmento. Ajuste o nome e em quantos dias o cliente costuma precisar de novo.
                  </p>
                </div>
                <div className="space-y-3">
                  {services.map((service, index) => (
                    <div key={service.key} className="grid grid-cols-[1fr_7.5rem_auto] items-start gap-2">
                      <div>
                        <Input
                          aria-label={`Nome do serviço ${index + 1}`}
                          value={service.name}
                          onChange={(e) =>
                            setServices((list) => list.map((s) => (s.key === service.key ? { ...s, name: e.target.value } : s)))
                          }
                          placeholder="Nome do serviço"
                          aria-invalid={!!errors[`services.${index}.name`]}
                        />
                        {errors[`services.${index}.name`] && (
                          <p className="mt-1 text-[13px] text-destructive">{errors[`services.${index}.name`]}</p>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          aria-label={`Retorno em dias do serviço ${index + 1}`}
                          inputMode="numeric"
                          value={service.returnIntervalDays}
                          onChange={(e) =>
                            setServices((list) =>
                              list.map((s) =>
                                s.key === service.key ? { ...s, returnIntervalDays: e.target.value.replace(/\D/g, "") } : s,
                              ),
                            )
                          }
                          className="pr-11"
                          aria-invalid={!!errors[`services.${index}.returnIntervalDays`]}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                          dias
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remover serviço"
                        onClick={() => setServices((list) => list.filter((s) => s.key !== service.key))}
                        disabled={services.length <= 1}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))}
                </div>
                {errors.services && <p className="text-[13px] text-destructive">{errors.services}</p>}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setServices((list) => [...list, { key: nextKey++, name: "", returnIntervalDays: defaultInterval }])}
                  disabled={services.length >= 20}
                >
                  <PlusIcon /> Adicionar serviço
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-semibold">Periodicidade padrão dos retornos</h2>
                  <p className="text-sm text-muted-foreground">
                    Usada para serviços sem intervalo próprio. Em cada atendimento você ainda pode ajustar a data manualmente.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {INTERVAL_PRESETS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setDefaultInterval(String(days))}
                      className={cn(
                        "cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors hover:bg-accent",
                        defaultInterval === String(days) && "border-primary bg-primary text-primary-foreground hover:bg-primary",
                      )}
                    >
                      {days < 365 ? `${days} dias` : "1 ano"}
                    </button>
                  ))}
                </div>
                <Field label="Ou informe em dias" htmlFor="defaultInterval" error={errors.defaultReturnIntervalDays} className="max-w-48">
                  <Input
                    id="defaultInterval"
                    inputMode="numeric"
                    value={defaultInterval}
                    onChange={(e) => setDefaultInterval(e.target.value.replace(/\D/g, ""))}
                  />
                </Field>
                <div className="rounded-xl border bg-muted/40 p-4 text-sm">
                  <p className="font-medium">Resumo</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>
                      <span className="text-foreground">{companyName}</span> · {segment ? SEGMENT_INFO[segment].label : ""}
                    </li>
                    <li>
                      {services.length} {services.length === 1 ? "serviço cadastrado" : "serviços cadastrados"}
                    </li>
                    <li>Modelos de mensagem para WhatsApp criados automaticamente</li>
                  </ul>
                </div>
              </div>
            )}

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between gap-3 border-t pt-5">
              <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
                <ArrowLeftIcon /> Voltar
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="submit">
                  Continuar <ArrowRightIcon />
                </Button>
              ) : (
                <SubmitButton pending={pending} pendingLabel="Configurando..." variant="emerald">
                  Concluir configuração <CheckIcon />
                </SubmitButton>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

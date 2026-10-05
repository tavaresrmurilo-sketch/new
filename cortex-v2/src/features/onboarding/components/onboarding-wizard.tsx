"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/misc";
import { CsvImporter } from "@/features/import/components/csv-importer";
import { StageEditor, type EditableStage } from "@/features/settings/components/stage-editor";
import { InviteForm } from "@/features/team/components/invite-form";
import { cn } from "@/lib/utils";
import { completeOnboardingAction, saveOnboardingAction } from "../actions";

const SEGMENTS = ["Engenharia", "Construção", "Manutenção", "Inspeções", "Consultoria", "Projetos", "Serviços B2B", "Outro"];
const SIZES = ["1–5", "6–20", "21–50", "51–200", "201–500", "500+"];
const GOALS = [
  "Organizar clientes e vendas",
  "Aumentar a conversão do pipeline",
  "Controlar projetos e prazos",
  "Ter visão gerencial e indicadores",
  "Reduzir tarefas esquecidas e atrasos",
];

const STEPS = ["Empresa", "Segmento", "Equipe", "Objetivo", "Clientes", "Pipeline", "Convites"];

export function OnboardingWizard({
  initialStep,
  org,
  pipeline,
  roles,
  clientCount,
  userName,
}: {
  initialStep: number;
  org: { name: string; segment: string; employeeRange: string; mainGoal: string };
  pipeline: { id: string; stages: EditableStage[] } | null;
  roles: { id: string; key: string; name: string }[];
  clientCount: number;
  userName: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialStep);
  const [values, setValues] = React.useState(org);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const save = async (patch: Partial<typeof org>) => {
    setBusy(true);
    const r = await saveOnboardingAction({ step, ...patch });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setStep((s) => s + 1);
  };

  const finish = async () => {
    setBusy(true);
    const r = await completeOnboardingAction({});
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setDone(true);
  };

  if (done) {
    return (
      <div className="rounded-xl border bg-background p-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Seu Córtex está pronto.</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          A partir de agora, cada cliente, oportunidade, projeto e tarefa alimenta o Morning Brief, os scores e o Córtex AI.
        </p>
        <Button className="mt-6" onClick={() => { router.push("/app/dashboard"); router.refresh(); }}>
          Ir para o dashboard <ArrowRight />
        </Button>
      </div>
    );
  }

  const choice = (opts: string[], value: string, onPick: (v: string) => void) => (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
      {opts.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onPick(o)}
          className={cn("rounded-md border px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent", value === o && "border-primary bg-primary/5 font-medium")}
        >
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Olá, {userName}! Etapa {step} de {STEPS.length} · {STEPS[step - 1]}
        </p>
        <Progress value={((step - 1) / STEPS.length) * 100} />
      </div>
      <div className="rounded-xl border bg-background p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Qual é o nome da sua empresa?</h1>
            <div className="space-y-1.5">
              <Label htmlFor="ob-name">Nome da empresa</Label>
              <Input id="ob-name" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} autoFocus />
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Em qual segmento vocês atuam?</h1>
            {choice(SEGMENTS, values.segment, (v) => setValues((s) => ({ ...s, segment: v })))}
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Quantas pessoas trabalham na empresa?</h1>
            {choice(SIZES, values.employeeRange, (v) => setValues((s) => ({ ...s, employeeRange: v })))}
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <h1 className="text-lg font-semibold">Qual é o objetivo principal com o Córtex?</h1>
            {choice(GOALS, values.mainGoal, (v) => setValues((s) => ({ ...s, mainGoal: v })))}
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold">Importe seus clientes</h1>
              <p className="text-sm text-muted-foreground">Envie uma planilha CSV exportada do seu sistema atual. {clientCount ? `Você já tem ${clientCount} cliente(s).` : "Você pode pular e fazer isso depois."}</p>
            </div>
            <CsvImporter entity="clients" allowEntityChoice={false} />
          </div>
        )}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold">Configure seu pipeline</h1>
              <p className="text-sm text-muted-foreground">Estas são as etapas sugeridas para empresas de serviços. Ajuste nomes e probabilidades — elas alimentam a previsão de receita.</p>
            </div>
            {pipeline ? <StageEditor pipelineId={pipeline.id} initial={pipeline.stages} onSaved={() => setStep(7)} submitLabel="Salvar e continuar" /> : null}
          </div>
        )}
        {step === 7 && (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold">Convide sua equipe</h1>
              <p className="text-sm text-muted-foreground">Cada pessoa recebe um papel com permissões adequadas. Você pode convidar mais pessoas depois.</p>
            </div>
            <InviteForm roles={roles} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || busy}>
          <ArrowLeft /> Voltar
        </Button>
        <div className="flex gap-2">
          {step >= 5 && step < 7 ? (
            <Button variant="outline" onClick={() => setStep((s) => s + 1)} disabled={busy}>
              Pular
            </Button>
          ) : null}
          {step === 1 && <Button onClick={() => save({ name: values.name.trim() })} loading={busy} disabled={values.name.trim().length < 2}>Continuar <ArrowRight /></Button>}
          {step === 2 && <Button onClick={() => save({ segment: values.segment })} loading={busy} disabled={!values.segment}>Continuar <ArrowRight /></Button>}
          {step === 3 && <Button onClick={() => save({ employeeRange: values.employeeRange })} loading={busy} disabled={!values.employeeRange}>Continuar <ArrowRight /></Button>}
          {step === 4 && <Button onClick={() => save({ mainGoal: values.mainGoal })} loading={busy} disabled={!values.mainGoal}>Continuar <ArrowRight /></Button>}
          {step === 5 && <Button onClick={() => setStep(6)}>Continuar <ArrowRight /></Button>}
          {step === 7 && (
            <Button onClick={finish} loading={busy}>
              <CheckCircle2 /> Concluir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

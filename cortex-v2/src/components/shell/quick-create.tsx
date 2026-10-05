"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormSkeleton } from "@/components/forms/form-shell";
import { invalidateFormOptions } from "@/hooks/use-form-options";
import { useShell, type CreateKind } from "./shell-context";

const loading = () => <FormSkeleton />;
const ClientForm = dynamic(() => import("@/features/clients/components/client-form").then((m) => m.ClientForm), { loading });
const LeadForm = dynamic(() => import("@/features/leads/components/lead-form").then((m) => m.LeadForm), { loading });
const OpportunityForm = dynamic(() => import("@/features/opportunities/components/opportunity-form").then((m) => m.OpportunityForm), { loading });
const ProjectForm = dynamic(() => import("@/features/projects/components/project-form").then((m) => m.ProjectForm), { loading });
const TaskForm = dynamic(() => import("@/features/tasks/components/task-form").then((m) => m.TaskForm), { loading });
const MeetingForm = dynamic(() => import("@/features/meetings/components/meeting-form").then((m) => m.MeetingForm), { loading });
const ContractForm = dynamic(() => import("@/features/contracts/components/contract-form").then((m) => m.ContractForm), { loading });

const META: Record<Exclude<CreateKind, "proposal">, { title: string; description: string; size?: "md" | "lg" }> = {
  client: { title: "Novo cliente", description: "Cadastre uma empresa ou pessoa atendida.", size: "lg" },
  lead: { title: "Novo lead", description: "Registre um contato que ainda está sendo qualificado.", size: "lg" },
  opportunity: { title: "Nova oportunidade", description: "Adicione um negócio ao pipeline.", size: "lg" },
  project: { title: "Novo projeto", description: "Planeje entregas, prazos e equipe.", size: "lg" },
  task: { title: "Nova tarefa", description: "Defina responsável, prazo e prioridade.", size: "lg" },
  meeting: { title: "Nova reunião", description: "Agende e documente reuniões com clientes e equipe.", size: "lg" },
  contract: { title: "Novo contrato", description: "Registre valores, vigência e renovação.", size: "lg" },
};

const HREF: Record<Exclude<CreateKind, "proposal">, (id: string) => string> = {
  client: (id) => `/app/clients/${id}`,
  lead: (id) => `/app/leads/${id}`,
  opportunity: (id) => `/app/opportunities/${id}`,
  project: (id) => `/app/projects/${id}`,
  task: (id) => `/app/tasks/${id}`,
  meeting: (id) => `/app/meetings/${id}`,
  contract: (id) => `/app/contracts/${id}`,
};

/** Host único dos diálogos de criação rápida (botão + Criar, command palette, atalho C). */
export function QuickCreateHost() {
  const router = useRouter();
  const { createKind, closeCreate, createDefaults } = useShell();
  const kind = createKind === "proposal" ? null : createKind;
  React.useEffect(() => {
    if (createKind === "proposal") {
      closeCreate();
      const qs = new URLSearchParams(Object.entries(createDefaults).filter(([, v]) => typeof v === "string") as [string, string][]).toString();
      router.push(`/app/proposals/new${qs ? `?${qs}` : ""}`);
    }
  }, [createKind, closeCreate, createDefaults, router]);

  const done = (id: string) => {
    invalidateFormOptions();
    closeCreate();
    if (kind && !createDefaults.__stay) router.push(HREF[kind](id));
  };
  const props = { defaultValues: createDefaults as never, onDone: done, onCancel: closeCreate };
  const label = typeof createDefaults.__clientLabel === "string" ? createDefaults.__clientLabel : null;
  return (
    <Dialog open={Boolean(kind)} onOpenChange={(v) => !v && closeCreate()}>
      {kind ? (
        <DialogContent size={META[kind].size ?? "md"}>
          <DialogHeader>
            <DialogTitle>{META[kind].title}</DialogTitle>
            <DialogDescription>{META[kind].description}</DialogDescription>
          </DialogHeader>
          {kind === "client" && <ClientForm {...props} />}
          {kind === "lead" && <LeadForm {...props} />}
          {kind === "opportunity" && <OpportunityForm {...props} clientLabel={label} />}
          {kind === "project" && <ProjectForm {...props} clientLabel={label} />}
          {kind === "task" && <TaskForm {...props} clientLabel={label} />}
          {kind === "meeting" && <MeetingForm {...props} clientLabel={label} />}
          {kind === "contract" && <ContractForm {...props} clientLabel={label} />}
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

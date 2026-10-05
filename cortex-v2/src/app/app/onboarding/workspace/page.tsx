import { WorkspaceForm } from "@/features/onboarding/components/workspace-form";

export const metadata = { title: "Novo workspace" };

export default function NewWorkspacePage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Criar um workspace</h1>
        <p className="text-sm text-muted-foreground">Cada workspace é completamente isolado: clientes, equipe, dados e plano próprios.</p>
      </div>
      <WorkspaceForm />
    </div>
  );
}

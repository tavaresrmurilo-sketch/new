"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ProposalEditor, type ProposalEditorHandle } from "./proposal-editor";
import type { ProposalInput } from "../schemas";

const AiProposalGenerator = dynamic(() => import("@/features/ai/components/ai-proposal-generator").then((m) => m.AiProposalGenerator), { ssr: false });

/** Página “Nova proposta”: editor + gerador com IA (o resultado entra no editor para revisão antes de salvar). */
export function NewProposalWorkspace({ defaults, labels, currency, aiAvailable }: { defaults: Partial<ProposalInput>; labels: { client?: string | null; opportunity?: string | null }; currency: string; aiAvailable: { enabled: boolean; reason?: string } }) {
  const editor = React.useRef<ProposalEditorHandle>(null);
  const [key, setKey] = React.useState(0);
  const [values, setValues] = React.useState(defaults);
  const [aiLabels, setAiLabels] = React.useState(labels);
  return (
    <div className="space-y-5">
      <AiProposalGenerator
        availability={aiAvailable}
        defaultClient={{ id: (defaults.clientId as string) ?? null, label: labels.client ?? null }}
        onGenerated={(v, clientLabel) => {
          setValues((prev) => ({ ...prev, ...v }));
          setAiLabels((l) => ({ ...l, client: clientLabel }));
          setKey((k) => k + 1);
        }}
      />
      <ProposalEditor key={key} ref={editor} defaultValues={values} labels={aiLabels} currency={currency} />
    </div>
  );
}

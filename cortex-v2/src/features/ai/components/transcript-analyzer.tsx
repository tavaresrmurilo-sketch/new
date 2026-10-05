"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ScrollText, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { confirmMeetingOutcomeAction, saveTranscriptAction } from "@/features/meetings/actions";
import { analyzeTranscriptAction } from "../actions";
import { AiUnavailable } from "./ai-unavailable";

type Draft = {
  summary: string;
  topics: string[];
  decisions: string[];
  tasks: { title: string; assigneeId: string | null; assigneeName: string | null; dueDate: string | null; include: boolean }[];
};

/**
 * Transcrição → resumo, assuntos, decisões e tarefas sugeridas pelo Córtex AI.
 * Nada é criado sem a confirmação do usuário (tarefas podem ser editadas ou desmarcadas).
 */
export function TranscriptAnalyzer({ meetingId, initialTranscript, availability, canWrite }: { meetingId: string; initialTranscript: string | null; availability: { enabled: boolean; reason?: string }; canWrite: boolean }) {
  const router = useRouter();
  const [transcript, setTranscript] = React.useState(initialTranscript ?? "");
  const [busy, setBusy] = React.useState<null | "save" | "analyze" | "confirm">(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [members, setMembers] = React.useState<{ id: string; name: string }[]>([]);

  const analyze = async () => {
    if (transcript.trim().length < 50) return toast.error("Cole a transcrição completa (mínimo de 50 caracteres).");
    setBusy("save");
    const saved = await saveTranscriptAction({ meetingId, transcript });
    if (!saved.ok) {
      setBusy(null);
      return toast.error(saved.error);
    }
    setBusy("analyze");
    const r = await analyzeTranscriptAction({ meetingId });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    setMembers(r.data.members);
    setDraft({ summary: r.data.summary, topics: r.data.topics, decisions: r.data.decisions, tasks: r.data.tasks.map((t) => ({ ...t, include: true })) });
  };

  const confirm = async () => {
    if (!draft) return;
    setBusy("confirm");
    const r = await confirmMeetingOutcomeAction({
      meetingId,
      summary: draft.summary,
      topics: draft.topics,
      decisions: draft.decisions.filter((d) => d.trim()),
      tasks: draft.tasks.map((t) => ({ title: t.title, assigneeId: t.assigneeId, dueDate: t.dueDate, include: t.include && t.title.trim().length >= 2 })),
    });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Resumo confirmado. ${r.data.tasks} tarefa(s) criada(s).`);
    setDraft(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {!availability.enabled ? <AiUnavailable reason={availability.reason} compact /> : null}
      <div className="space-y-2">
        <label htmlFor="transcript" className="flex items-center gap-1.5 text-sm font-medium"><ScrollText className="size-4" /> Transcrição da reunião</label>
        <Textarea id="transcript" rows={8} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Cole aqui a transcrição (ex.: exportada do Meet, Teams ou Zoom)…" disabled={!canWrite} />
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" loading={busy === "save" && !draft} onClick={async () => { setBusy("save"); const r = await saveTranscriptAction({ meetingId, transcript }); setBusy(null); if (r.ok) toast.success("Transcrição salva"); else toast.error(r.error); }} disabled={transcript.trim().length < 50}>
              Salvar transcrição
            </Button>
            {availability.enabled ? (
              <Button size="sm" loading={busy === "analyze"} onClick={analyze} disabled={transcript.trim().length < 50}>
                <Sparkles /> Analisar com o Córtex AI
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {draft ? (
        <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary"><Sparkles className="size-3.5" /> Sugestão do Córtex AI — revise antes de confirmar</p>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Resumo</p>
            <Textarea rows={4} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} aria-label="Resumo" />
          </div>
          {draft.topics.length ? (
            <div>
              <p className="text-sm font-medium">Principais assuntos</p>
              <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">{draft.topics.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Decisões</p>
            {draft.decisions.length ? draft.decisions.map((d, i) => (
              <Input key={i} value={d} onChange={(e) => setDraft({ ...draft, decisions: draft.decisions.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Decisão ${i + 1}`} />
            )) : <p className="text-sm text-muted-foreground">Nenhuma decisão identificada.</p>}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Tarefas sugeridas</p>
            {draft.tasks.length ? draft.tasks.map((t, i) => (
              <div key={i} className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[24px_minmax(0,1fr)_180px_150px] sm:items-center">
                <input type="checkbox" className="size-4" checked={t.include} onChange={(e) => setDraft({ ...draft, tasks: draft.tasks.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)) })} aria-label="Incluir tarefa" />
                <Input value={t.title} onChange={(e) => setDraft({ ...draft, tasks: draft.tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} aria-label="Título da tarefa" />
                <NativeSelect value={t.assigneeId ?? ""} onChange={(e) => setDraft({ ...draft, tasks: draft.tasks.map((x, j) => (j === i ? { ...x, assigneeId: e.target.value || null } : x)) })} aria-label="Responsável">
                  <option value="">{t.assigneeName ? `“${t.assigneeName}” (não identificado)` : "Sem responsável"}</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </NativeSelect>
                <Input type="date" value={t.dueDate ?? ""} onChange={(e) => setDraft({ ...draft, tasks: draft.tasks.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)) })} aria-label="Prazo" />
              </div>
            )) : <p className="text-sm text-muted-foreground">Nenhuma tarefa identificada.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>Descartar sugestão</Button>
            <Button loading={busy === "confirm"} onClick={confirm}>
              <CheckCircle2 /> Confirmar e criar {draft.tasks.filter((t) => t.include).length} tarefa(s)
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

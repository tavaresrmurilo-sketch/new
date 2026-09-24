"use client";

import { ArrowUp, BrainCircuit, Calculator, MessageSquarePlus, PencilLine, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BlockRenderer, type UIBlock } from "@/components/cortex/blocks";
import { Markdown } from "@/components/cortex/markdown";
import { TraceDialog, TraceFooter } from "@/components/cortex/trace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { fmt } from "@/lib/format";
import { CHAT_SUGGESTIONS } from "@/lib/suggestions";
import { cn } from "@/lib/utils";

interface Trace {
  planner: string;
  narrator: string;
  narratorRejected?: { reason: string };
  tools: { name: string; title: string; sufficient: boolean }[];
  meta: {
    periods: { start: string; end: string; label: string }[];
    comparisons: { start: string; end: string; label: string }[];
    sources: { id: string; name: string; kind: string; lastUpdatedAt: string }[];
    lastUpdated: string | null;
    filters: Record<string, string>;
    calculation: { tool: string; steps: { label: string; formula?: string; value?: number | string | null; detail?: string }[] }[];
    notes: string[];
  };
}

interface Msg {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  blocks?: UIBlock[] | null;
  trace?: Trace | null;
  provider?: string | null;
  createdAt: string;
  feedback?: { rating: "UP" | "DOWN"; correction: string | null } | null;
}

interface Conv {
  id: string;
  title: string;
  updatedAt: string;
}

export function ChatClient({ initialQuestion, engine }: { initialQuestion: string | null; engine: string }) {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const loadConversations = useCallback(async () => {
    const r = await api<{ conversations: Conv[] }>("/api/chat/conversations", { silent: true }).catch(() => null);
    if (r) setConversations(r.conversations);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || loading) return;
      setInput("");
      setLoading(true);
      const temp: Msg = { id: `tmp-${Date.now()}`, role: "USER", content: q, createdAt: new Date().toISOString() };
      setMessages((m) => [...m, temp]);
      try {
        const r = await api<{ conversationId: string; message: Msg }>("/api/chat", { method: "POST", json: { question: q, conversationId: conversationId ?? undefined } });
        setConversationId(r.conversationId);
        setMessages((m) => [...m, r.message]);
        loadConversations();
      } catch {
        setMessages((m) => m.filter((x) => x.id !== temp.id));
        setInput(q);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, loading, loadConversations],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      send(initialQuestion);
    }
  }, [initialQuestion, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function openConversation(id: string) {
    const r = await api<{ messages: Msg[] }>(`/api/chat/conversations/${id}`);
    setConversationId(id);
    setMessages(r.messages);
  }

  async function removeConversation(id: string) {
    await api(`/api/chat/conversations/${id}`, { method: "DELETE" });
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
    }
    loadConversations();
  }

  function newConversation() {
    setConversationId(null);
    setMessages([]);
  }

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)] lg:-mx-6">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card/50 xl:flex">
        <div className="p-3">
          <Button variant="outline" className="w-full justify-start" onClick={newConversation}>
            <MessageSquarePlus /> Nova conversa
          </Button>
        </div>
        <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {conversations.length === 0 ? <p className="px-2 py-4 text-xs text-muted-foreground">Nenhuma conversa ainda.</p> : null}
          {conversations.map((c) => (
            <div key={c.id} className={cn("group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted", c.id === conversationId && "bg-muted")}>
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => openConversation(c.id)} title={c.title}>
                {c.title}
              </button>
              <button className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => removeConversation(c.id)} aria-label="Excluir conversa">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.length === 0 && !loading ? (
              <div className="pt-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <BrainCircuit className="h-6 w-6" />
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-tight">Pergunte ao Cortex</h1>
                <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                  Respostas calculadas a partir dos dados da sua empresa, com período, fonte e memória de cálculo. Quando não houver dados suficientes, o Cortex dirá isso.
                </p>
                <div className="mt-8 grid gap-2 sm:grid-cols-2">
                  {CHAT_SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-lg border bg-card px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/40">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((m) => (m.role === "USER" ? <UserBubble key={m.id} text={m.content} /> : <AssistantMessage key={m.id} msg={m} />))}
            {loading ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BrainCircuit className="h-4 w-4 animate-pulse text-primary" /> Cortex está consultando os dados e calculando...
                </p>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t bg-background/95 px-4 py-3 lg:px-8">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="Pergunte qualquer coisa sobre sua empresa..."
              className="max-h-40 min-h-[44px] resize-none py-3"
            />
            <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={loading || !input.trim()} aria-label="Enviar">
              <ArrowUp />
            </Button>
          </form>
          <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-muted-foreground">
            Motor: {engine}. O Cortex não inventa números: todo valor é calculado a partir da base e pode ser auditado em &ldquo;Ver cálculo&rdquo;.
          </p>
        </div>
      </section>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground">{text}</div>
    </div>
  );
}

function AssistantMessage({ msg }: { msg: Msg }) {
  const [feedback, setFeedback] = useState(msg.feedback ?? null);
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState(msg.feedback?.correction ?? "");
  const t = msg.trace;

  async function rate(rating: "UP" | "DOWN", text?: string) {
    await api("/api/feedback", { method: "POST", json: { messageId: msg.id, rating, correction: text || undefined } });
    setFeedback({ rating, correction: text ?? null });
    toast.success("Obrigado! Seu feedback foi registrado.");
  }

  const hasNumbers = Boolean(t && t.tools.some((x) => x.sufficient));
  return (
    <div className="animate-fade-in">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BrainCircuit className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-medium">Cortex</span>
        <span className="text-[11px] text-muted-foreground">{fmt.dateTime(msg.createdAt)}</span>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <Markdown text={msg.content} />
        {msg.blocks?.length ? (
          <div className="mt-4">
            <BlockRenderer blocks={msg.blocks} />
          </div>
        ) : null}
        {t && hasNumbers ? (
          <div className="mt-4 border-t pt-3">
            <TraceFooter meta={{ periods: t.meta.periods, comparisons: t.meta.comparisons, sources: t.meta.sources, lastUpdated: t.meta.lastUpdated, filters: t.meta.filters }} />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {t && hasNumbers ? (
            <TraceDialog
              meta={{ periods: t.meta.periods, comparisons: t.meta.comparisons, sources: t.meta.sources, lastUpdated: t.meta.lastUpdated, filters: t.meta.filters, calculations: t.meta.calculation, notes: [...t.meta.notes, ...(t.narratorRejected ? [t.narratorRejected.reason] : []), `Consultas executadas: ${t.tools.map((x) => x.name).join(", ")}`] }}
              trigger={
                <Button variant="outline" size="sm">
                  <Calculator /> Ver cálculo
                </Button>
              }
            />
          ) : null}
          <Button variant={feedback?.rating === "UP" ? "secondary" : "ghost"} size="sm" onClick={() => rate("UP")}>
            <ThumbsUp /> Útil
          </Button>
          <Button variant={feedback?.rating === "DOWN" ? "secondary" : "ghost"} size="sm" onClick={() => rate("DOWN")}>
            <ThumbsDown /> Não útil
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCorrecting(true)}>
            <PencilLine /> Corrigir resposta
          </Button>
        </div>
      </div>
      <Dialog open={correcting} onOpenChange={setCorrecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir resposta</DialogTitle>
            <DialogDescription>Descreva o que está incorreto. A correção é revisada pela equipe para melhorar regras e prompts — ela nunca altera dados financeiros automaticamente.</DialogDescription>
          </DialogHeader>
          <Textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={5} maxLength={2000} placeholder="Ex.: a despesa X deveria estar classificada como custo..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrecting(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                await rate("DOWN", correction);
                setCorrecting(false);
              }}
              disabled={!correction.trim()}
            >
              Enviar correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

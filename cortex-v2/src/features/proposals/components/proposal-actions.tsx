"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Copy, CopyPlus, FileDown, MessageSquareReply, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { deleteProposalAction, duplicateProposalAction, proposalFollowUpAction, setProposalStatusAction } from "../actions";

type Status = "DRAFT" | "SENT" | "NEGOTIATION" | "ACCEPTED" | "REJECTED" | "EXPIRED";

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button type="button" variant="outline" size="icon" aria-label="Copiar link" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); }}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

export function ProposalActions({ id, status, publicUrl, hasOpportunity, canWrite, canDelete }: { id: string; status: string; publicUrl: string | null; hasOpportunity: boolean; canWrite: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [reject, setReject] = React.useState(false);
  const [accept, setAccept] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [markWon, setMarkWon] = React.useState(true);
  const setStatus = useAction(setProposalStatusAction, {
    onSuccess: (d) => {
      if (d.pendingApproval) toast.info("Envio aguardando aprovação de um gestor na Central de Decisões.");
      else toast.success("Status atualizado");
    },
  });
  const duplicate = useAction(duplicateProposalAction, { success: "Proposta duplicada", onSuccess: (d) => router.push(`/app/proposals/${d.id}/edit`) });
  const followUp = useAction(proposalFollowUpAction, { success: "Follow-up registrado" });
  const editable = canWrite && !["ACCEPTED", "REJECTED"].includes(status);
  const run = (s: Status, extra: { reason?: string; markOpportunityWon?: boolean } = {}) => setStatus.run({ id, status: s, ...extra });
  return (
    <>
      <a href={`/api/proposals/${id}/pdf`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
        <FileDown /> PDF
      </a>
      {publicUrl ? (
        <EntityDialog title="Link da proposta para o cliente" size="md" trigger={<Button size="sm" variant="outline"><Copy /> Link</Button>}>
          {() => (
            <div className="space-y-3 px-5 py-4 text-sm">
              <p className="text-muted-foreground">Envie este link ao cliente. Cada abertura é registrada (data e quantidade de visualizações) e o responsável é notificado na primeira visualização. O cliente também pode aceitar a proposta pelo link.</p>
              <CopyField value={publicUrl} />
            </div>
          )}
        </EntityDialog>
      ) : null}
      {canWrite && status === "DRAFT" ? (
        <Button size="sm" loading={setStatus.pending} onClick={() => void run("SENT")}>
          <Send /> Marcar como enviada
        </Button>
      ) : null}
      {canWrite && ["SENT", "VIEWED", "NEGOTIATION"].includes(status) ? (
        <EntityDialog title="Registrar follow-up" size="md" trigger={<Button size="sm" variant="outline"><MessageSquareReply /> Follow-up</Button>}>
          {(close) => <FollowUpForm pending={followUp.pending} onSubmit={async (note) => { const r = await followUp.run({ id, note }); if (r.ok) close(); }} />}
        </EntityDialog>
      ) : null}
      {canWrite ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">Mais <ChevronDown /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            {editable ? <DropdownMenuItem asChild><Link href={`/app/proposals/${id}/edit`}><Pencil /> Editar</Link></DropdownMenuItem> : null}
            {["SENT", "VIEWED"].includes(status) ? <DropdownMenuItem onSelect={() => void run("NEGOTIATION")}>Mover para negociação</DropdownMenuItem> : null}
            {["SENT", "VIEWED", "NEGOTIATION"].includes(status) ? <DropdownMenuItem onSelect={() => setAccept(true)}>Marcar como aceita</DropdownMenuItem> : null}
            {["SENT", "VIEWED", "NEGOTIATION"].includes(status) ? <DropdownMenuItem onSelect={() => setReject(true)}>Marcar como recusada</DropdownMenuItem> : null}
            {["SENT", "VIEWED", "NEGOTIATION"].includes(status) ? <DropdownMenuItem onSelect={() => void run("EXPIRED")}>Marcar como expirada</DropdownMenuItem> : null}
            {["REJECTED", "EXPIRED"].includes(status) ? <DropdownMenuItem onSelect={() => void run("DRAFT")}>Voltar para rascunho</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={() => void duplicate.run({ id })}><CopyPlus /> Duplicar</DropdownMenuItem>
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <ConfirmDialog
                  title="Excluir proposta?"
                  description="A proposta irá para a lixeira."
                  destructive
                  confirmLabel="Excluir"
                  trigger={<DropdownMenuItem destructive onSelect={(e) => e.preventDefault()}><Trash2 /> Excluir</DropdownMenuItem>}
                  onConfirm={async () => {
                    const r = await deleteProposalAction({ id });
                    if (r.ok) router.push("/app/proposals");
                    else toast.error(r.error);
                  }}
                />
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <ConfirmDialog
        open={accept}
        onOpenChange={setAccept}
        title="Marcar proposta como aceita?"
        description={
          hasOpportunity ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={markWon} onChange={(e) => setMarkWon(e.target.checked)} className="size-4" /> Também marcar a oportunidade vinculada como ganha
            </label>
          ) : undefined
        }
        confirmLabel="Confirmar aceite"
        onConfirm={() => run("ACCEPTED", { markOpportunityWon: hasOpportunity && markWon })}
      />
      <ConfirmDialog
        open={reject}
        onOpenChange={setReject}
        title="Registrar recusa"
        description={
          <span className="mt-2 block space-y-1.5">
            <Label htmlFor="rej-reason">Motivo (opcional)</Label>
            <Textarea id="rej-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </span>
        }
        confirmLabel="Registrar recusa"
        destructive
        onConfirm={() => run("REJECTED", { reason })}
      />
    </>
  );
}

function FollowUpForm({ onSubmit, pending }: { onSubmit: (note: string) => Promise<void>; pending: boolean }) {
  const [note, setNote] = React.useState("");
  return (
    <div className="space-y-3 px-5 py-4">
      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Liguei para o cliente; retorno previsto para sexta." aria-label="Descrição do follow-up" autoFocus />
      <p className="text-xs text-muted-foreground">O follow-up é registrado na timeline. Nenhuma mensagem é enviada automaticamente ao cliente.</p>
      <div className="flex justify-end">
        <Button loading={pending} disabled={note.trim().length < 2} onClick={() => void onSubmit(note)}>Registrar</Button>
      </div>
    </div>
  );
}

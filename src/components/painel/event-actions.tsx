"use client";

import { BarChart3, Ban, Copy, ExternalLink, Flame, MoreHorizontal, PencilLine, Send, Sparkles, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Field, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { BOOST_DURATION_DAYS } from "@/lib/plans";
import type { ActionState } from "@/lib/action";
import {
  boostEventAction,
  cancelEventAction,
  deleteEventAction,
  duplicateEventAction,
  publishEventAction,
  withdrawEventAction,
} from "@/server/events/actions";
import type { PanelStatusValue } from "./status-badge";

export interface ActionEvent {
  id: string;
  slug: string;
  title: string;
  status: string;
  panelStatus: PanelStatusValue;
  featured: boolean;
  featuredUntil: string | null;
  timezone: string;
  going: number;
  saves: number;
}

export interface BoostQuota {
  limit: number;
  used: number;
}

type Dialogs = "cancel" | "delete" | "boost" | null;

/** Menu de ações de um evento (lista e cabeçalhos). */
export function EventActions({ event, quota, align = "end" }: { event: ActionEvent; quota: BoostQuota; align?: "start" | "end" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [reason, setReason] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);

  const isPublic = event.status === "PUBLISHED" || event.status === "CANCELED" || event.status === "ARCHIVED";
  const live = event.panelStatus === "PUBLISHED";
  const canDelete = event.status === "DRAFT" || event.status === "REJECTED";
  const canPublish = event.status === "DRAFT" || event.status === "REJECTED";

  function run<T>(fn: () => Promise<ActionState<T>>, after?: (res: ActionState<T>) => void) {
    start(async () => {
      const res = await fn();
      if (res.status === "error") {
        const code = res.fieldErrors?._code;
        if (code === "PLAN_LIMIT" && dialog === "boost") setPlanError(res.message);
        else if (code === "PLAN_LIMIT") toast.error(res.message, { action: { label: "Ver planos", onClick: () => router.push("/painel/plano") } });
        else if (code === "INCOMPLETE") toast.error(res.message, { action: { label: "Completar", onClick: () => router.push(`/painel/eventos/${event.id}`) } });
        else toast.error(res.message);
        return;
      }
      if (res.status === "success" && res.message) toast.success(res.message);
      setDialog(null);
      after?.(res);
      router.refresh();
    });
  }

  const remaining = Math.max(0, quota.limit - quota.used);

  return (
    <>
      <DropdownMenu>
        <DropdownTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Ações para ${event.title}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownTrigger>
        <DropdownContent align={align} className="w-60">
          <DropdownItem asChild>
            <Link href={`/painel/eventos/${event.id}`}>
              <PencilLine /> {event.status === "CANCELED" || event.panelStatus === "ENDED" ? "Ver detalhes" : "Editar"}
            </Link>
          </DropdownItem>
          {canPublish && (
            <DropdownItem onSelect={() => run(() => publishEventAction(event.id))}>
              <Send /> {event.status === "REJECTED" ? "Reenviar" : "Publicar"}
            </DropdownItem>
          )}
          {event.status === "PENDING_REVIEW" && (
            <DropdownItem onSelect={() => run(() => withdrawEventAction(event.id))}>
              <Undo2 /> Retirar da análise
            </DropdownItem>
          )}
          <DropdownItem onSelect={() => run(() => duplicateEventAction(event.id), (res) => res.status === "success" && res.data && router.push(`/painel/eventos/${res.data.eventId}`))}>
            <Copy /> Duplicar
          </DropdownItem>
          {isPublic && (
            <DropdownItem asChild>
              <Link href={`/evento/${event.slug}`} target="_blank" rel="noopener">
                <ExternalLink /> Ver página
              </Link>
            </DropdownItem>
          )}
          {event.status !== "DRAFT" && (
            <DropdownItem asChild>
              <Link href={`/painel/eventos/${event.id}/estatisticas`}>
                <BarChart3 /> Estatísticas
              </Link>
            </DropdownItem>
          )}
          {live && (
            <DropdownItem
              disabled={event.featured}
              onSelect={() => {
                setPlanError(null);
                setDialog("boost");
              }}
            >
              <Flame /> {event.featured ? "Em destaque" : "Destacar"}
            </DropdownItem>
          )}
          {(live || canDelete) && <DropdownSeparator />}
          {live && (
            <DropdownItem destructive onSelect={() => setDialog("cancel")}>
              <Ban /> Cancelar evento
            </DropdownItem>
          )}
          {canDelete && (
            <DropdownItem destructive onSelect={() => setDialog("delete")}>
              <Trash2 /> Excluir
            </DropdownItem>
          )}
        </DropdownContent>
      </DropdownMenu>

      <Dialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Cancelar evento?" description={event.title}>
          <div className="flex flex-col gap-4">
            <p className="text-[15px] text-muted-foreground">
              O evento sai do mapa e a página passa a mostrar que foi cancelado.
              {event.going + event.saves > 0 && " Vamos avisar quem marcou “vou” ou salvou o evento."}
            </p>
            <Field label="Motivo" htmlFor={`cancel-${event.id}`} optional hint="Fica registrado no histórico da organização.">
              <Textarea id={`cancel-${event.id}`} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: previsão de chuva forte" />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Voltar
              </Button>
              <Button variant="danger" loading={pending} onClick={() => run(() => cancelEventAction(event.id, reason))}>
                <Ban /> Cancelar evento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Excluir evento?" description={event.title}>
          <div className="flex flex-col gap-4">
            <p className="text-[15px] text-muted-foreground">Esta ação não pode ser desfeita.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Voltar
              </Button>
              <Button variant="danger" loading={pending} onClick={() => run(() => deleteEventAction(event.id), () => router.push("/painel/eventos"))}>
                <Trash2 /> Excluir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "boost"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Destacar no mapa" description={event.title}>
          <div className="flex flex-col gap-4">
            {quota.limit === 0 || planError ? (
              <Alert tone="info" icon={<Sparkles />} title={quota.limit === 0 ? "Destaques fazem parte dos planos pagos" : "Cota de destaques esgotada"}>
                {planError ?? "Com o Pro, seus eventos ganham pino em evidência e prioridade nas listas por alguns dias."}
              </Alert>
            ) : (
              <>
                <p className="text-[15px] text-muted-foreground">
                  O evento ganha selo de destaque e prioridade no mapa e nas listas por {BOOST_DURATION_DAYS} dias (ou até terminar, o que vier antes).
                </p>
                <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">Destaques disponíveis este mês</span>
                  <span className="font-bold">
                    {remaining} de {quota.limit}
                  </span>
                </div>
              </>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Agora não
              </Button>
              {quota.limit === 0 || planError ? (
                <Button asChild variant="primary">
                  <Link href="/painel/plano">
                    <Sparkles /> Ver planos
                  </Link>
                </Button>
              ) : (
                <Button variant="primary" loading={pending} disabled={remaining === 0} onClick={() => run(() => boostEventAction(event.id))}>
                  <Flame /> Destacar por {BOOST_DURATION_DAYS} dias
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function featuredLabel(featuredUntil: string | null, timezone: string) {
  return featuredUntil ? `Em destaque até ${formatDateTime(new Date(featuredUntil), timezone)}` : null;
}

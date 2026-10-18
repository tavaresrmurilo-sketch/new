"use client";

import { Ban, Check, EyeOff, Play, RefreshCw, RotateCcw, ShieldCheck, ShieldX, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import {
  changeOrgPlanAction,
  reactivateOrgAction,
  reactivateUserAction,
  resendEmailAction,
  runJobAction,
  setOrgFlagAction,
  suspendOrgAction,
  suspendUserAction,
} from "@/server/admin/actions";
import { approveEventAction, dismissReportAction, rejectEventAction, resolveReportAction, unpublishEventAction } from "@/server/moderation/actions";
import { cn } from "@/lib/utils";
import { ConfirmAction, useRunAction } from "./confirm-action";
import { PLAN_LABEL, REJECTION_SUGGESTIONS } from "./labels";

// ─────────────────────────────── Moderação

export function ModerationActions({ eventId, orgName, orgTrusted }: { eventId: string; orgName: string; orgTrusted: boolean }) {
  const { pending, run } = useRunAction();
  return (
    <div className="grid gap-2">
      <Button variant="primary" block loading={pending} onClick={() => run(() => approveEventAction(eventId, false))}>
        <Check /> Aprovar e publicar
      </Button>
      {!orgTrusted && (
        <ConfirmAction
          trigger={
            <Button variant="outline" block disabled={pending}>
              <ShieldCheck /> Aprovar e confiar
            </Button>
          }
          title="Aprovar e confiar nesta organização"
          description={`Os próximos eventos de ${orgName} serão publicados direto, sem passar pela análise (no modo “apenas organizações novas”). Você pode desfazer isso na página da organização.`}
          confirmLabel="Aprovar e confiar"
          tone="primary"
          onConfirm={() => approveEventAction(eventId, true)}
        />
      )}
      <ConfirmAction
        trigger={
          <Button variant="danger-soft" block disabled={pending}>
            <X /> Recusar
          </Button>
        }
        title="Recusar evento"
        description="O motivo vai para a equipe do organizador (no app e por e-mail). Seja específico para que possam corrigir."
        confirmLabel="Recusar evento"
        reason={{ label: "Motivo da recusa", min: 10, suggestions: REJECTION_SUGGESTIONS, placeholder: "Explique o que precisa ser ajustado…" }}
        onConfirm={({ reason }) => rejectEventAction(eventId, reason)}
      />
    </div>
  );
}

export function UnpublishButton({ eventId, size = "sm" }: { eventId: string; size?: "sm" | "md" }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="danger-soft" size={size}>
          <EyeOff /> Despublicar
        </Button>
      }
      title="Retirar evento do ar"
      description="O evento volta para “Recusado” e some do mapa e das buscas. A equipe do organizador recebe o motivo."
      confirmLabel="Retirar do ar"
      reason={{ label: "Motivo", min: 10, suggestions: REJECTION_SUGGESTIONS, placeholder: "Explique por que o evento saiu do ar…" }}
      onConfirm={({ reason }) => unpublishEventAction(eventId, reason)}
    />
  );
}

// ─────────────────────────────── Denúncias

export function ReportActions({
  reportId,
  sameTargetOpen,
  canUnpublish,
  canSuspend,
  orgName,
}: {
  reportId: string;
  sameTargetOpen: number;
  canUnpublish: boolean;
  canSuspend: boolean;
  orgName: string | null;
}) {
  const others = Math.max(0, sameTargetOpen - 1);
  const siblings = others
    ? [
        {
          name: "all",
          label: others > 1 ? `Aplicar também às outras ${others} denúncias abertas sobre o mesmo alvo` : "Aplicar também à outra denúncia aberta sobre o mesmo alvo",
          defaultChecked: true,
        },
      ]
    : undefined;
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <ConfirmAction
        trigger={
          <Button variant="ghost" size="sm" className="h-11 sm:h-9">
            Descartar
          </Button>
        }
        title="Descartar denúncia"
        description="Use quando não houver violação das regras. Nada muda no evento."
        confirmLabel="Descartar"
        tone="primary"
        reason={{ label: "Observação interna", min: 0, optional: true, placeholder: "Ex.: informações conferidas com o organizador" }}
        options={siblings}
        onConfirm={({ reason, options }) => dismissReportAction(reportId, { note: reason || undefined, applyToSameTarget: Boolean(options.all) })}
      />
      <ConfirmAction
        trigger={
          <Button variant="solid" size="sm" className="h-11 sm:h-9">
            <Check /> Resolver
          </Button>
        }
        title="Resolver denúncia"
        description="Registre o que foi feito. A providência é aplicada na hora e fica na auditoria."
        confirmLabel="Resolver"
        tone="primary"
        choice={{
          label: "Providência",
          defaultValue: "none",
          options: [
            { value: "none", label: "Só registrar a resolução", description: "Ex.: organizador corrigiu as informações." },
            {
              value: "unpublish",
              label: "Despublicar o evento",
              description: canUnpublish ? "Some do mapa e a equipe do organizador recebe o motivo." : "O evento não está publicado.",
              disabled: !canUnpublish,
            },
            {
              value: "suspend_org",
              label: orgName ? `Suspender ${orgName}` : "Suspender a organização",
              description: canSuspend ? "Todos os eventos da organização saem do ar e a equipe perde acesso ao painel." : "A organização já está suspensa.",
              disabled: !canSuspend,
            },
          ],
        }}
        reason={{ label: "Resolução", min: 3, placeholder: "O que foi verificado e decidido", hint: "Também é enviada ao organizador quando o evento é despublicado." }}
        options={siblings}
        onConfirm={({ reason, options, choice }) => resolveReportAction(reportId, { resolution: reason, action: choice ?? "none", applyToSameTarget: Boolean(options.all) })}
      />
    </div>
  );
}

// ─────────────────────────────── Usuários

export function UserStatusActions({ userId, name, status, locked }: { userId: string; name: string; status: string; locked: string | null }) {
  const { pending, run } = useRunAction();
  if (locked) return <p className="text-sm text-muted-foreground">{locked}</p>;
  if (status === "DELETED") return <p className="text-sm text-muted-foreground">Conta excluída pela própria pessoa — não pode ser reativada.</p>;
  if (status === "SUSPENDED") {
    return (
      <Button variant="soft" loading={pending} onClick={() => run(() => reactivateUserAction(userId))}>
        <RotateCcw /> Reativar conta
      </Button>
    );
  }
  return (
    <ConfirmAction
      trigger={
        <Button variant="danger-soft">
          <Ban /> Suspender conta
        </Button>
      }
      title={`Suspender ${name}`}
      description="A pessoa sai de todos os dispositivos na hora e não consegue entrar até ser reativada."
      confirmLabel="Suspender"
      reason={{ label: "Motivo (fica na auditoria)", min: 5, placeholder: "Ex.: spam recorrente em denúncias" }}
      onConfirm={({ reason }) => suspendUserAction(userId, reason)}
    />
  );
}

// ─────────────────────────────── Organizações

export function OrgFlagSwitch({ orgId, flag, value, label, description }: { orgId: string; flag: "verified" | "trusted"; value: boolean; label: string; description: string }) {
  const [checked, setChecked] = useState(value);
  const { pending, run } = useRunAction();
  const id = `flag-${flag}`;
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{description}</span>
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={pending}
        onCheckedChange={(v) => {
          setChecked(v);
          run(() => setOrgFlagAction(orgId, flag, v), (res) => res.status === "error" && setChecked(!v));
        }}
      />
    </div>
  );
}

export function OrgStatusActions({ orgId, name, status }: { orgId: string; name: string; status: string }) {
  const { pending, run } = useRunAction();
  if (status === "SUSPENDED") {
    return (
      <Button variant="soft" loading={pending} onClick={() => run(() => reactivateOrgAction(orgId))}>
        <RotateCcw /> Reativar organização
      </Button>
    );
  }
  return (
    <ConfirmAction
      trigger={
        <Button variant="danger-soft">
          <ShieldX /> Suspender organização
        </Button>
      }
      title={`Suspender ${name}`}
      description="Os eventos saem do mapa, das buscas e da página pública na hora. A equipe recebe o motivo e perde acesso ao painel."
      confirmLabel="Suspender"
      reason={{ label: "Motivo (enviado à equipe da organização)", min: 5, placeholder: "Ex.: venda de ingressos falsos confirmada" }}
      onConfirm={({ reason }) => suspendOrgAction(orgId, reason)}
    />
  );
}

export function ChangePlanButton({ orgId, current, activeSubscription }: { orgId: string; current: string; activeSubscription: boolean }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="outline" size="sm">
          Alterar plano
        </Button>
      }
      title="Alterar plano manualmente"
      description="Use para cortesias, parcerias ou cobranças fora do Stripe. A mudança vale na hora e fica registrada na auditoria."
      confirmLabel="Alterar plano"
      tone="primary"
      choice={{
        label: "Novo plano",
        defaultValue: current === "FREE" ? "PRO" : "FREE",
        options: (["FREE", "PRO", "BUSINESS"] as const).map((t) => ({
          value: t,
          label: PLAN_LABEL[t],
          description: t === current ? "Plano atual" : undefined,
          disabled: t === current,
        })),
      }}
      reason={{ label: "Motivo", min: 5, placeholder: "Ex.: parceria com o festival — 3 meses de cortesia" }}
      onConfirm={({ reason, choice }) => changeOrgPlanAction(orgId, choice ?? "", reason)}
    >
      {activeSubscription && (
        <Alert tone="warning" title="Há uma assinatura ativa no Stripe">
          O próximo evento de cobrança do Stripe pode sobrescrever o plano escolhido aqui. Para mudanças definitivas, ajuste a assinatura no Stripe.
        </Alert>
      )}
    </ConfirmAction>
  );
}

// ─────────────────────────────── E-mails e rotinas

export function ResendEmailButton({ id, disabledReason, className }: { id: string; disabledReason?: string | null; className?: string }) {
  const { pending, run } = useRunAction();
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <Button variant="soft" size="sm" className="h-11 sm:h-9" loading={pending} disabled={Boolean(disabledReason)} onClick={() => run(() => resendEmailAction(id))}>
        <RefreshCw /> Reenviar
      </Button>
      {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
    </div>
  );
}

export function RunJobButton({ job, label }: { job: string; label: string }) {
  const { pending, run } = useRunAction();
  return (
    <Button variant="soft" size="sm" className="h-11 sm:h-9" loading={pending} onClick={() => run(() => runJobAction(job))} aria-label={`Executar agora: ${label}`}>
      <Play /> Executar agora
    </Button>
  );
}

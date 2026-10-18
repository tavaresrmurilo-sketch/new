"use client";

import { Crown, LogOut, Mail, MoreHorizontal, RefreshCw, Send, Shield, ShieldCheck, Sparkles, UserMinus, UserPlus, UserRoundPen, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { FormMessage, fieldError } from "@/components/ui/form-message";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card, EmptyState } from "@/components/ui/misc";
import type { ActionState } from "@/lib/action";
import { cn } from "@/lib/utils";
import {
  changeRoleAction,
  inviteMemberAction,
  leaveOrganizationAction,
  removeMemberAction,
  resendInviteAction,
  revokeInviteAction,
  transferOwnershipAction,
} from "@/server/team/actions";

type Role = "OWNER" | "ADMIN" | "EDITOR";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: Role;
  since: string;
}

export interface TeamInvite {
  id: string;
  email: string;
  role: Role;
  expiresLabel: string;
  expired: boolean;
  invitedBy: string | null;
}

export interface TeamLimit {
  used: number;
  max: number;
  planName: string;
  upgrade: { name: string; maxMembers: number } | null;
}

const ROLE_LABEL: Record<Role, string> = { OWNER: "Proprietário(a)", ADMIN: "Administrador(a)", EDITOR: "Editor(a)" };
const ROLE_TONE: Record<Role, "brand" | "primary" | "neutral"> = { OWNER: "brand", ADMIN: "primary", EDITOR: "neutral" };

type Confirm =
  | { kind: "remove"; member: TeamMember }
  | { kind: "transfer"; member: TeamMember }
  | { kind: "leave" }
  | { kind: "revoke"; invite: TeamInvite };

export function TeamManager({
  organizationId,
  orgName,
  me,
  members,
  invites,
  limit,
  canManage,
}: {
  organizationId: string;
  orgName: string;
  me: { userId: string; role: Role };
  members: TeamMember[];
  invites: TeamInvite[];
  limit: TeamLimit;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const isOwner = me.role === "OWNER";
  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  const lastOwner = isOwner && ownerCount <= 1;
  const full = limit.used >= limit.max;

  function run(task: () => Promise<ActionState>, after?: () => void) {
    start(async () => {
      const res = await task();
      if (res.status === "success") {
        if (res.message) toast.success(res.message);
        after?.();
        router.refresh();
      } else if (res.status === "error") toast.error(res.message);
    });
  }

  function confirmNow() {
    if (!confirm) return;
    const close = () => setConfirm(null);
    if (confirm.kind === "remove") run(() => removeMemberAction({ organizationId, userId: confirm.member.userId }), close);
    else if (confirm.kind === "transfer") run(() => transferOwnershipAction({ organizationId, userId: confirm.member.userId }), close);
    else if (confirm.kind === "revoke") run(() => revokeInviteAction(confirm.invite.id), close);
    else if (confirm.kind === "leave") run(() => leaveOrganizationAction(organizationId), close);
  }

  return (
    <div className="space-y-6">
      <LimitBar limit={limit} canManage={canManage} onInvite={() => setInviteOpen(true)} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <h2 className="text-base font-bold tracking-tight">
            Pessoas <span className="font-semibold text-muted-foreground tabular-nums">· {members.length}</span>
          </h2>
        </div>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              me={me}
              lastOwner={lastOwner}
              disabled={pending}
              onRole={(role) => run(() => changeRoleAction({ organizationId, userId: m.userId, role }))}
              onConfirm={setConfirm}
            />
          ))}
        </ul>
      </Card>

      {canManage && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-base font-bold tracking-tight">
              Convites pendentes {invites.length > 0 && <span className="font-semibold text-muted-foreground tabular-nums">· {invites.length}</span>}
            </h2>
          </div>
          {invites.length === 0 ? (
            <EmptyState
              icon={<Mail />}
              title="Nenhum convite pendente"
              description="Quando você convidar alguém, o convite aparece aqui até ser aceito. Cada link vale por 7 dias."
              className="py-10"
            />
          ) : (
            <ul className="divide-y divide-border">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground">
                    <Mail className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{inv.email}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                      <span>{ROLE_LABEL[inv.role]}</span>
                      <span aria-hidden>·</span>
                      {inv.expired ? <Badge tone="warning">Expirado</Badge> : <span>Expira em {inv.expiresLabel}</span>}
                      {inv.invitedBy && (
                        <>
                          <span aria-hidden className="hidden sm:inline">
                            ·
                          </span>
                          <span className="hidden sm:inline">Convidado por {inv.invitedBy}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-11 sm:h-9"
                      disabled={pending || (inv.role === "ADMIN" && !isOwner)}
                      onClick={() => run(() => resendInviteAction(inv.id))}
                      aria-label={`Reenviar convite para ${inv.email}`}
                    >
                      <RefreshCw />
                      <span className="hidden sm:inline">Reenviar</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-danger"
                      disabled={pending}
                      onClick={() => setConfirm({ kind: "revoke", invite: inv })}
                      aria-label={`Cancelar convite para ${inv.email}`}
                    >
                      <X />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <RolesGuide />

      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-base font-bold tracking-tight">Sair da organização</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {lastOwner
              ? "Você é a única pessoa proprietária. Transfira a propriedade para alguém da equipe antes de sair."
              : `Você perde o acesso ao painel de ${orgName}. Os eventos publicados continuam no ar.`}
          </p>
        </div>
        <Button variant="danger-soft" disabled={lastOwner || pending} onClick={() => setConfirm({ kind: "leave" })} className="shrink-0">
          <LogOut /> Sair da organização
        </Button>
      </Card>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={organizationId}
        isOwner={isOwner}
        full={full}
        limit={limit}
        onDone={() => router.refresh()}
      />

      <Dialog open={confirm != null} onOpenChange={(o) => !o && !pending && setConfirm(null)}>
        {confirm && (
          <DialogContent title={confirmTitle(confirm)} description={confirmBody(confirm, orgName)}>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={pending}>
                Voltar
              </Button>
              <Button variant={confirm.kind === "transfer" ? "solid" : "danger"} loading={pending} onClick={confirmNow}>
                {confirmCta(confirm)}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function confirmTitle(c: Confirm) {
  switch (c.kind) {
    case "remove":
      return `Remover ${c.member.name} da equipe?`;
    case "transfer":
      return `Transferir a propriedade para ${c.member.name}?`;
    case "revoke":
      return "Cancelar este convite?";
    case "leave":
      return "Sair da organização?";
  }
}

function confirmBody(c: Confirm, orgName: string) {
  switch (c.kind) {
    case "remove":
      return `${c.member.name} perde o acesso ao painel de ${orgName} na hora. Você pode convidar de novo depois.`;
    case "transfer":
      return `${c.member.name} passa a ser proprietário(a) de ${orgName}, com controle total da equipe e do plano. Você continua na equipe como administrador(a).`;
    case "revoke":
      return `O link enviado para ${c.invite.email} deixa de funcionar.`;
    case "leave":
      return `Você perde o acesso ao painel de ${orgName}. Para voltar, alguém da equipe precisa convidar você de novo.`;
  }
}

function confirmCta(c: Confirm) {
  return { remove: "Remover", transfer: "Transferir propriedade", revoke: "Cancelar convite", leave: "Sair" }[c.kind];
}

function LimitBar({ limit, canManage, onInvite }: { limit: TeamLimit; canManage: boolean; onInvite: () => void }) {
  const full = limit.used >= limit.max;
  const solo = limit.max <= 1;
  const pct = Math.min(100, Math.round((limit.used / Math.max(1, limit.max)) * 100));
  return (
    <Card className={cn("p-5 sm:p-6", full && canManage && limit.upgrade && "border-primary/30")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            Plano <span className="font-semibold text-foreground">{limit.planName}</span>
            {" · "}
            {solo ? "individual" : <span className="tabular-nums">{limit.used} de {limit.max} vagas usadas</span>}
          </p>
          {!solo && (
            <div
              className="mt-2.5 h-2 max-w-sm overflow-hidden rounded-full bg-primary-soft"
              role="meter"
              aria-label="Vagas da equipe"
              aria-valuemin={0}
              aria-valuemax={limit.max}
              aria-valuenow={limit.used}
            >
              <div className={cn("h-full rounded-full", full ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
            </div>
          )}
          {full && (
            <p className="mt-2.5 text-sm leading-relaxed">
              {solo
                ? "O plano Gratuito é para uma pessoa só."
                : "Sua equipe chegou ao limite do plano (convites pendentes também ocupam vaga)."}
              {limit.upgrade && ` Com o ${limit.upgrade.name}, até ${limit.upgrade.maxMembers} pessoas trabalham juntas.`}
            </p>
          )}
        </div>
        {canManage && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {full && limit.upgrade ? (
              <Button asChild variant="primary">
                <Link href="/painel/plano">
                  <Sparkles /> Fazer upgrade
                </Link>
              </Button>
            ) : null}
            {!full && (
              <Button variant="primary" onClick={onInvite}>
                <UserPlus /> Convidar pessoa
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function MemberRow({
  member: m,
  me,
  lastOwner,
  disabled,
  onRole,
  onConfirm,
}: {
  member: TeamMember;
  me: { userId: string; role: Role };
  lastOwner: boolean;
  disabled: boolean;
  onRole: (role: "ADMIN" | "EDITOR") => void;
  onConfirm: (c: Confirm) => void;
}) {
  const self = m.userId === me.userId;
  const iAmOwner = me.role === "OWNER";
  const canChangeRole = iAmOwner && !self && m.role !== "OWNER";
  const canTransfer = iAmOwner && !self;
  const canRemove = !self && me.role !== "EDITOR" && (m.role !== "OWNER" || iAmOwner);
  const canLeave = self && !lastOwner;
  const hasMenu = canChangeRole || canTransfer || canRemove || canLeave;

  return (
    <li className="flex items-center gap-3 px-5 py-4 sm:px-6">
      <Avatar name={m.name} src={m.avatarUrl} />
      <div className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
        <div className="min-w-0 md:flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <span className="truncate">{m.name}</span>
            {self && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-px text-[11px] font-bold text-muted-foreground">Você</span>}
          </p>
          <p className="truncate text-[13px] text-muted-foreground">{m.email}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground md:hidden">
            <Badge tone={ROLE_TONE[m.role]}>
              {m.role === "OWNER" && <Crown />} {ROLE_LABEL[m.role]}
            </Badge>
            <span className="whitespace-nowrap">desde {m.since}</span>
          </p>
        </div>
        <div className="hidden w-44 shrink-0 md:block">
          <Badge tone={ROLE_TONE[m.role]}>
            {m.role === "OWNER" && <Crown />} {ROLE_LABEL[m.role]}
          </Badge>
        </div>
        <p className="hidden w-36 shrink-0 text-sm text-muted-foreground tabular-nums md:block">desde {m.since}</p>
      </div>
      <div className="w-11 shrink-0">
        {hasMenu && (
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Opções para ${m.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              {canChangeRole && m.role === "EDITOR" && (
                <DropdownItem onSelect={() => onRole("ADMIN")}>
                  <ShieldCheck /> Tornar administrador(a)
                </DropdownItem>
              )}
              {canChangeRole && m.role === "ADMIN" && (
                <DropdownItem onSelect={() => onRole("EDITOR")}>
                  <UserRoundPen /> Tornar editor(a)
                </DropdownItem>
              )}
              {canTransfer && (
                <DropdownItem onSelect={() => onConfirm({ kind: "transfer", member: m })}>
                  <Crown /> Transferir propriedade
                </DropdownItem>
              )}
              {canRemove && (
                <>
                  {(canChangeRole || canTransfer) && <DropdownSeparator />}
                  <DropdownItem destructive onSelect={() => onConfirm({ kind: "remove", member: m })}>
                    <UserMinus /> Remover da equipe
                  </DropdownItem>
                </>
              )}
              {canLeave && (
                <DropdownItem destructive onSelect={() => onConfirm({ kind: "leave" })}>
                  <LogOut /> Sair da organização
                </DropdownItem>
              )}
            </DropdownContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

function RolesGuide() {
  const roles = [
    { icon: <Crown />, role: "Proprietário(a)", text: "Tudo o que administradores fazem, além de alterar papéis e transferir a propriedade." },
    { icon: <Shield />, role: "Administrador(a)", text: "Publica eventos, gerencia locais, convida editores, remove pessoas e cuida do plano e da cobrança." },
    { icon: <UserRoundPen />, role: "Editor(a)", text: "Cria, publica e edita os eventos da organização. Vê o plano e a equipe em modo leitura." },
  ];
  return (
    <section aria-labelledby="papeis" className="rounded-3xl border border-dashed border-border-strong p-5 sm:p-6">
      <h2 id="papeis" className="text-base font-bold tracking-tight">
        O que cada papel pode fazer
      </h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {roles.map((r) => (
          <div key={r.role} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary [&_svg]:size-[18px]">{r.icon}</span>
            <div>
              <dt className="text-sm font-semibold">{r.role}</dt>
              <dd className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{r.text}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  organizationId,
  isOwner,
  full,
  limit,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  organizationId: string;
  isOwner: boolean;
  full: boolean;
  limit: TeamLimit;
  onDone: () => void;
}) {
  const [state, setState] = useState<ActionState>({ status: "idle" });
  const [role, setRole] = useState<"EDITOR" | "ADMIN">("EDITOR");
  const [pending, start] = useTransition();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await inviteMemberAction({ status: "idle" }, fd);
      setState(res);
      if (res.status === "success") {
        toast.success(res.message ?? "Convite enviado.");
        form.reset();
        setRole("EDITOR");
        setState({ status: "idle" });
        onOpenChange(false);
        onDone();
      }
    });
  }

  const limitHit = state.status === "error" && state.fieldErrors?._code === "PLAN_LIMIT";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setState({ status: "idle" });
        onOpenChange(o);
      }}
    >
      <DialogContent title="Convidar para a equipe" description="A pessoa recebe um e-mail com um link que vale por 7 dias.">
        {full ? (
          <div className="py-2">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Sua equipe já usa todas as vagas do plano {limit.planName}.{limit.upgrade ? ` Faça upgrade para o ${limit.upgrade.name} e convide até ${limit.upgrade.maxMembers} pessoas.` : ""}
            </p>
            {limit.upgrade && (
              <Button asChild variant="primary" block className="mt-5">
                <Link href="/painel/plano">
                  <Sparkles /> Ver planos
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="role" value={role} />
            <Field label="E-mail" htmlFor="invite-email" error={fieldError(state, "email")}>
              <Input
                id="invite-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="nome@exemplo.com"
                required
                aria-invalid={Boolean(fieldError(state, "email")) || undefined}
                aria-describedby={fieldError(state, "email") ? "invite-email-error" : undefined}
              />
            </Field>
            <fieldset>
              <legend className="text-sm font-semibold">Papel</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Papel">
                <RoleOption
                  checked={role === "EDITOR"}
                  onSelect={() => setRole("EDITOR")}
                  title="Editor(a)"
                  text="Cria, publica e edita eventos."
                  icon={<UserRoundPen />}
                />
                <RoleOption
                  checked={role === "ADMIN"}
                  onSelect={() => setRole("ADMIN")}
                  disabled={!isOwner}
                  title="Administrador(a)"
                  text={isOwner ? "Também gerencia equipe, locais e plano." : "Só proprietários convidam administradores."}
                  icon={<ShieldCheck />}
                />
              </div>
              {fieldError(state, "role") && (
                <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
                  {fieldError(state, "role")}
                </p>
              )}
            </fieldset>
            {state.status === "error" && !state.fieldErrors?.email && <FormMessage state={state} />}
            {limitHit && (
              <Button asChild variant="soft" block>
                <Link href="/painel/plano">
                  <Sparkles /> Ver planos
                </Link>
              </Button>
            )}
            <Button type="submit" variant="primary" block loading={pending}>
              <Send /> Enviar convite
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleOption({
  checked,
  onSelect,
  disabled,
  title,
  text,
  icon,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled?: boolean;
  title: string;
  text: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 items-start gap-3 rounded-2xl border p-3.5 text-left transition focus-visible:ring-4 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55",
        checked ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-border-strong",
      )}
    >
      <span className={cn("mt-0.5 [&_svg]:size-5", checked ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{text}</span>
      </span>
    </button>
  );
}

"use client";

import * as React from "react";
import { Pencil, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Input, NativeSelect } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { createRoleAction, deleteRoleAction, revokeInviteAction, setRolePermissionsAction, updateMemberAction } from "../actions";
import { InviteForm } from "./invite-form";

type Role = { id: string; key: string; name: string; isSystem: boolean };

export function InviteButton({ roles }: { roles: Role[] }) {
  return (
    <EntityDialog title="Convidar pessoas" size="md" trigger={<Button size="sm"><UserPlus /> Convidar</Button>}>
      {(close) => <InviteForm roles={roles} onDone={close} />}
    </EntityDialog>
  );
}

export function RevokeInviteButton({ id }: { id: string }) {
  const { run, pending } = useAction(revokeInviteAction, { success: "Convite revogado" });
  return <Button size="xs" variant="ghost" loading={pending} onClick={() => run({ id })}>Revogar</Button>;
}

export function EditMemberButton({ member, roles, departments, isSelf }: { member: { id: string; roleId: string; title: string | null; department: string | null; weeklyCapacityHours: number; status: string; name: string }; roles: Role[]; departments: string[]; isSelf: boolean }) {
  return (
    <EntityDialog title={`Editar ${member.name}`} size="md" trigger={<Button size="icon-sm" variant="ghost" aria-label={`Editar ${member.name}`}><Pencil /></Button>}>
      {(close) => <MemberForm member={member} roles={roles} departments={departments} isSelf={isSelf} onDone={close} />}
    </EntityDialog>
  );
}

function MemberForm({ member, roles, departments, isSelf, onDone }: { member: { id: string; roleId: string; title: string | null; department: string | null; weeklyCapacityHours: number; status: string }; roles: Role[]; departments: string[]; isSelf: boolean; onDone: () => void }) {
  const [v, setV] = React.useState({ roleId: member.roleId, title: member.title ?? "", department: member.department ?? "", weeklyCapacityHours: String(member.weeklyCapacityHours), status: member.status as "ACTIVE" | "DISABLED" });
  const { run, pending } = useAction(updateMemberAction, { success: "Membro atualizado", onSuccess: onDone });
  return (
    <div className="space-y-3 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Papel" htmlFor="m-role">
          <NativeSelect id="m-role" value={v.roleId} disabled={isSelf} onChange={(e) => setV({ ...v, roleId: e.target.value })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Cargo" htmlFor="m-title"><Input id="m-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
        <Field label="Departamento" htmlFor="m-dep">
          <NativeSelect id="m-dep" value={v.department} onChange={(e) => setV({ ...v, department: e.target.value })}>
            <option value="">—</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Capacidade semanal (h)" htmlFor="m-cap"><Input id="m-cap" type="number" min={1} max={80} value={v.weeklyCapacityHours} onChange={(e) => setV({ ...v, weeklyCapacityHours: e.target.value })} /></Field>
        <Field label="Situação" htmlFor="m-status">
          <NativeSelect id="m-status" value={v.status} disabled={isSelf} onChange={(e) => setV({ ...v, status: e.target.value as "ACTIVE" | "DISABLED" })}>
            <option value="ACTIVE">Ativo</option>
            <option value="DISABLED">Desativado (perde o acesso)</option>
          </NativeSelect>
        </Field>
      </div>
      {isSelf ? <p className="text-xs text-muted-foreground">Você não pode alterar seu próprio papel ou situação.</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button loading={pending} onClick={() => run({ memberId: member.id, roleId: isSelf ? undefined : v.roleId, title: v.title || null, department: v.department || null, weeklyCapacityHours: Number(v.weeklyCapacityHours), status: isSelf ? undefined : v.status })}>Salvar</Button>
      </div>
    </div>
  );
}

export function PermissionMatrix({ roles, granted, canEdit, customRolesEnabled }: { roles: Role[]; granted: Record<string, Permission[]>; canEdit: boolean; customRolesEnabled: boolean }) {
  const [state, setState] = React.useState<Record<string, Set<Permission>>>(() => Object.fromEntries(roles.map((r) => [r.id, new Set(granted[r.id] ?? [])])));
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [newRole, setNewRole] = React.useState("");
  const save = useAction(setRolePermissionsAction, { success: "Permissões salvas" });
  const create = useAction(createRoleAction, { success: "Papel criado", onSuccess: () => setNewRole("") });
  const del = useAction(deleteRoleAction, { success: "Papel removido" });
  const groups = React.useMemo(() => {
    const g = new Map<string, Permission[]>();
    for (const [k, meta] of Object.entries(PERMISSIONS)) g.set(meta.group, [...(g.get(meta.group) ?? []), k as Permission]);
    return [...g.entries()];
  }, []);
  const editable = (r: Role) => canEdit && r.key !== "OWNER";
  const toggle = (roleId: string, p: Permission) => {
    setState((s) => {
      const next = new Set(s[roleId]);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return { ...s, [roleId]: next };
    });
    setDirty((d) => new Set(d).add(roleId));
  };
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-subtle">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Permissão</th>
              {roles.map((r) => (
                <th key={r.id} className="px-2 py-2 text-center font-medium">
                  <div>{r.name}</div>
                  {!r.isSystem && canEdit ? <button type="button" className="text-[11px] font-normal text-destructive hover:underline" onClick={() => { if (confirm(`Remover o papel ${r.name}?`)) void del.run({ id: r.id }); }}>remover</button> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, perms]) => (
              <React.Fragment key={group}>
                <tr className="border-t bg-muted/40"><td colSpan={roles.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</td></tr>
                {perms.map((p) => (
                  <tr key={p} className="border-t">
                    <td className="px-3 py-1.5">{PERMISSIONS[p].description}<span className="ml-1 text-[11px] text-muted-foreground">({p})</span></td>
                    {roles.map((r) => (
                      <td key={r.id} className="px-2 py-1.5 text-center">
                        <Checkbox checked={state[r.id]?.has(p) ?? false} disabled={!editable(r)} onCheckedChange={() => toggle(r.id, p)} aria-label={`${r.name}: ${PERMISSIONS[p].description}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!dirty.size}
            loading={save.pending}
            onClick={async () => {
              for (const id of dirty) {
                const r = await save.run({ roleId: id, permissions: [...(state[id] ?? [])] });
                if (!r.ok) return;
              }
              setDirty(new Set());
            }}
          >
            Salvar alterações
          </Button>
          <span className="text-xs text-muted-foreground">O papel Proprietário sempre tem acesso total.</span>
          <div className="ml-auto flex items-center gap-2">
            <Input className="h-8 w-48" placeholder="Novo papel personalizado" value={newRole} onChange={(e) => setNewRole(e.target.value)} disabled={!customRolesEnabled} />
            <Button size="sm" variant="outline" disabled={newRole.trim().length < 2 || !customRolesEnabled} loading={create.pending} onClick={() => (customRolesEnabled ? create.run({ name: newRole }) : toast.error("Papéis personalizados não estão no seu plano."))}><Plus /> Criar</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

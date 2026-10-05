"use client";

import * as React from "react";
import { Pencil, Plus, Star } from "lucide-react";
import { EntityDialog } from "@/components/common/entity-dialog";
import { DeleteButton } from "@/components/common/delete-button";
import { StatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DECISION_ROLE } from "@/lib/labels";
import { formatPhone } from "@/lib/format";
import { deleteContactAction } from "../actions";
import type { ContactInput } from "../schemas";
import { ContactForm } from "./contact-form";

export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  jobTitle: string | null;
  department: string | null;
  decisionRole: string;
  influence: number;
  reportsToId: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export function ContactsManager({ clientId, contacts, canWrite, canDelete }: { clientId: string; contacts: ContactRow[]; canWrite: boolean; canDelete: boolean }) {
  const options = contacts.map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="space-y-3">
      {canWrite ? (
        <EntityDialog
          title="Novo contato"
          trigger={
            <Button size="sm" variant="outline">
              <Plus /> Adicionar contato
            </Button>
          }
        >
          {(close) => <ContactForm clientId={clientId} contacts={options} onDone={close} onCancel={close} />}
        </EntityDialog>
      ) : null}
      {contacts.length ? (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>Cargo</TH>
                <TH>Papel</TH>
                <TH>Contato</TH>
                <TH className="w-20" />
              </TR>
            </THead>
            <TBody>
              {contacts.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <span className="inline-flex items-center gap-1 font-medium">
                      {c.name}
                      {c.isPrimary ? <Star className="size-3 fill-amber-400 text-amber-500" aria-label="Contato principal" /> : null}
                    </span>
                  </TD>
                  <TD className="text-muted-foreground">{[c.jobTitle, c.department].filter(Boolean).join(" · ") || "—"}</TD>
                  <TD>
                    <StatusBadge map={DECISION_ROLE} value={c.decisionRole} />
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {c.email ? <a href={`mailto:${c.email}`} className="block hover:underline">{c.email}</a> : null}
                    {c.phone ? <span className="block">{formatPhone(c.phone)}</span> : null}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end">
                      {canWrite ? (
                        <EntityDialog
                          title="Editar contato"
                          trigger={
                            <Button size="icon-sm" variant="ghost" aria-label={`Editar ${c.name}`}>
                              <Pencil />
                            </Button>
                          }
                        >
                          {(close) => <ContactForm id={c.id} clientId={clientId} contacts={options} defaultValues={{ ...c, clientId, decisionRole: c.decisionRole as ContactInput["decisionRole"] }} onDone={close} onCancel={close} />}
                        </EntityDialog>
                      ) : null}
                      {canDelete ? <DeleteButton action={deleteContactAction} id={c.id} label={c.name} iconOnly /> : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum contato cadastrado para este cliente.</p>
      )}
    </div>
  );
}

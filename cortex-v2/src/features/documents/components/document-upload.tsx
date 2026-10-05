"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Field, FormGrid } from "@/components/common/field";
import { EntityDialog } from "@/components/common/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { DOCUMENT_CATEGORY } from "@/lib/labels";
import { uploadDocumentAction } from "../actions";

type Defaults = Partial<Record<"clientId" | "projectId" | "opportunityId" | "taskId" | "proposalId" | "contractId" | "meetingId" | "category", string>>;

function UploadForm({ defaults, onDone, onCancel }: { defaults: Defaults; onDone: () => void; onCancel: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [fileName, setFileName] = React.useState("");
  return (
    <form
      className="flex flex-col"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const fd = new FormData(e.currentTarget);
        for (const [k, v] of Object.entries(defaults)) if (v && !fd.get(k)) fd.set(k, v);
        setBusy(true);
        const r = await uploadDocumentAction(fd);
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success("Documento enviado");
        onDone();
        router.refresh();
      }}
    >
      <div className="space-y-4 px-5 py-4">
        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center hover:bg-subtle">
          <Upload className="size-5 text-muted-foreground" />
          <span className="text-sm font-medium">{fileName || "Selecionar arquivo"}</span>
          <span className="text-xs text-muted-foreground">PDF, imagens, Office, CSV, TXT, ZIP ou DWG</span>
          <input name="file" type="file" required className="sr-only" onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
        </label>
        <FormGrid>
          <Field label="Nome" htmlFor="doc-name" hint="Vazio = nome do arquivo">
            <Input id="doc-name" name="name" />
          </Field>
          <Field label="Categoria" htmlFor="doc-cat">
            <NativeSelect id="doc-cat" name="category" defaultValue={defaults.category ?? "OTHER"}>
              {Object.entries(DOCUMENT_CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tags" htmlFor="doc-tags" hint="Separadas por vírgula" className="sm:col-span-2">
            <Input id="doc-tags" name="tags" />
          </Field>
          <Field label="Descrição" htmlFor="doc-desc" className="sm:col-span-2">
            <Textarea id="doc-desc" name="description" rows={2} />
          </Field>
        </FormGrid>
        {defaults.clientId || defaults.projectId ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sharedWithClient" value="true" className="size-4" /> Compartilhar no Portal do Cliente
          </label>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t bg-subtle/50 px-5 py-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" loading={busy}>
          Enviar
        </Button>
      </div>
    </form>
  );
}

export function DocumentUploadButton({ defaults = {}, label = "Enviar documento" }: { defaults?: Defaults; label?: string }) {
  return (
    <EntityDialog
      title="Enviar documento"
      size="md"
      trigger={
        <Button size="sm" variant="outline">
          <Upload /> {label}
        </Button>
      }
    >
      {(close) => <UploadForm defaults={defaults} onDone={close} onCancel={close} />}
    </EntityDialog>
  );
}

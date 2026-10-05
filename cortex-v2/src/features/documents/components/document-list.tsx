import * as React from "react";
import { Download, Eye, FileText, Globe, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/common/delete-button";
import { formatBytes, formatDateTime } from "@/lib/format";
import { DOCUMENT_CATEGORY } from "@/lib/labels";
import { deleteDocumentAction } from "../actions";

interface Doc {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  sharedWithClient: boolean;
  createdAt: Date;
}

export function DocumentList({ documents, tz, canDelete }: { documents: Doc[]; tz: string; canDelete: boolean }) {
  if (!documents.length) return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nenhum documento enviado.</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {documents.map((d) => {
        const Icon = d.mimeType.startsWith("image/") ? ImageIcon : FileText;
        const previewable = d.mimeType === "application/pdf" || d.mimeType.startsWith("image/");
        return (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {d.fileName} · {formatBytes(d.sizeBytes)} · {formatDateTime(d.createdAt, tz)}
              </p>
            </div>
            <Badge>{DOCUMENT_CATEGORY[d.category]}</Badge>
            {d.sharedWithClient ? (
              <Badge tone="info" title="Visível no Portal do Cliente">
                <Globe /> Portal
              </Badge>
            ) : null}
            {previewable ? (
              <a href={`/api/files/${d.id}?inline=1`} target="_blank" rel="noreferrer" className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Visualizar ${d.name}`}>
                <Eye className="size-4" />
              </a>
            ) : null}
            <a href={`/api/files/${d.id}`} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Baixar ${d.name}`}>
              <Download className="size-4" />
            </a>
            {canDelete ? <DeleteButton action={deleteDocumentAction} id={d.id} label={d.name} iconOnly /> : null}
          </li>
        );
      })}
    </ul>
  );
}

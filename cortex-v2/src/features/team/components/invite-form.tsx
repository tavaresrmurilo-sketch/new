"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, NativeSelect, Textarea } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { inviteMembersAction } from "../actions";

type Result = { email: string; status: string; link?: string; emailed?: boolean };

export function InviteForm({ roles, defaultRoleKey = "MEMBER", onDone }: { roles: { id: string; key: string; name: string }[]; defaultRoleKey?: string; onDone?: () => void }) {
  const [emails, setEmails] = React.useState("");
  const [roleId, setRoleId] = React.useState(roles.find((r) => r.key === defaultRoleKey)?.id ?? roles[0]?.id ?? "");
  const [results, setResults] = React.useState<Result[]>([]);
  const { run, pending } = useAction(inviteMembersAction, {
    onSuccess: (r) => {
      setResults(r);
      const invited = r.filter((x) => x.status === "invited").length;
      if (invited) toast.success(`${invited} convite(s) criado(s)`);
      setEmails("");
      onDone?.();
    },
  });
  const list = emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="inv-emails">E-mails</Label>
        <Textarea id="inv-emails" rows={3} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ana@empresa.com.br, carlos@empresa.com.br" />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-role">Papel</Label>
          <NativeSelect id="inv-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-48">
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="button" loading={pending} disabled={!list.length} onClick={() => void run({ emails: list, roleId })}>
          Enviar convite{list.length > 1 ? "s" : ""}
        </Button>
      </div>
      {results.length ? (
        <ul className="space-y-1.5 rounded-md border p-3 text-[13px]">
          {results.map((r) => (
            <li key={r.email} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.email}</span>
              {r.status === "already_member" ? <span className="text-muted-foreground">já é membro</span> : null}
              {r.status === "invited" && r.emailed ? <span className="text-success">convite enviado por e-mail</span> : null}
              {r.status === "invited" && r.link ? <CopyLink link={r.link} /> : null}
            </li>
          ))}
          {results.some((r) => r.link) ? <li className="pt-1 text-xs text-muted-foreground">O envio de e-mail não está configurado: compartilhe o link de convite diretamente (válido por 7 dias).</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar link de convite"}
    </Button>
  );
}

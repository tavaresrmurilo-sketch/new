"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { exampleTemplateValues, findUnknownVariables, renderTemplate, TEMPLATE_MAX_LENGTH, TEMPLATE_VARIABLES } from "@/lib/templates";
import { deleteTemplateAction, saveTemplateAction } from "@/modules/messaging/actions";

type ServiceOption = { id: string; name: string };
type TemplateValue = { id: string; name: string; body: string; isDefault: boolean; serviceId: string | null; serviceName: string | null };

function Preview({ body, companyName }: { body: string; companyName: string }) {
  const text = useMemo(() => renderTemplate(body, exampleTemplateValues(companyName)), [body, companyName]);
  return (
    <div className="rounded-xl bg-[#e7f6ee] p-3 dark:bg-emerald-soft">
      <p className="mb-1 text-[11px] font-medium tracking-wide text-emerald-soft-foreground uppercase">Exemplo com dados fictícios</p>
      <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-white px-3 py-2 text-sm whitespace-pre-line text-slate-900 shadow-sm dark:bg-card dark:text-card-foreground">
        {text || "…"}
      </div>
    </div>
  );
}

function EditorForm({
  template,
  services,
  companyName,
  onDone,
}: {
  template?: TemplateValue;
  services: ServiceOption[];
  companyName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "Olá, {primeiro_nome}! Tudo bem? Aqui é da {empresa}. ");
  const [serviceId, setServiceId] = useState(template?.serviceId ?? "todos");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const unknown = findUnknownVariables(body);

  function insert(variable: string) {
    const el = textarea.current;
    const token = `{${variable}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await saveTemplateAction(template?.id ?? null, { name, body, serviceId, isDefault });
      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      toast.success(result.message);
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome do modelo" htmlFor="tpl-name" error={errors.name}>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lembrete de limpeza" />
        </Field>
        <Field label="Usar para" htmlFor="tpl-service">
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger id="tpl-service">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os serviços</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  Somente {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tpl-body" className="justify-between">
          Mensagem
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {body.length}/{TEMPLATE_MAX_LENGTH}
          </span>
        </Label>
        <Textarea
          id="tpl-body"
          ref={textarea}
          rows={6}
          maxLength={TEMPLATE_MAX_LENGTH}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={unknown.length > 0 || !!errors.body}
        />
        {unknown.length > 0 ? (
          <p className="text-[13px] text-destructive">Variável desconhecida: {unknown.map((v) => `{${v}}`).join(", ")}</p>
        ) : errors.body ? (
          <p className="text-[13px] text-destructive">{errors.body}</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Inserir variável">
          {TEMPLATE_VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.label}
              onClick={() => insert(v.key)}
              className="cursor-pointer rounded-md border bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {`{${v.key}}`}
            </button>
          ))}
        </div>
      </div>
      <Preview body={body} companyName={companyName} />
      <div className="flex items-center gap-3">
        <Switch id="tpl-default" checked={isDefault} onCheckedChange={setIsDefault} disabled={template?.isDefault} />
        <Label htmlFor="tpl-default" className="font-normal">
          Modelo padrão (usado quando não houver um modelo específico do serviço)
        </Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <SubmitButton pending={pending} pendingLabel="Salvando..." disabled={unknown.length > 0}>
          Salvar modelo
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function TemplateEditor({
  template,
  services,
  companyName,
  trigger,
}: {
  template?: TemplateValue;
  services: ServiceOption[];
  companyName: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PlusIcon /> Novo modelo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? "Editar modelo" : "Novo modelo"}</DialogTitle>
          <DialogDescription>Clique em uma variável para inseri-la no texto. Ela será trocada pelos dados do cliente.</DialogDescription>
        </DialogHeader>
        {open && <EditorForm template={template} services={services} companyName={companyName} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function TemplateCard({
  template,
  services,
  companyName,
}: {
  template: TemplateValue;
  services: ServiceOption[];
  companyName: string;
}) {
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {template.name}
          {template.isDefault && (
            <Badge variant="success">
              <StarIcon /> Padrão
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{template.serviceName ? `Somente para ${template.serviceName}` : "Todos os serviços"}</CardDescription>
        <CardAction className="flex gap-1">
          <TemplateEditor
            template={template}
            services={services}
            companyName={companyName}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Editar ${template.name}`}>
                <PencilIcon />
              </Button>
            }
          />
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${template.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon />
              </Button>
            }
            title={`Excluir “${template.name}”?`}
            description={<p>O histórico de mensagens já registradas não é afetado.</p>}
            confirmLabel="Excluir"
            onConfirm={async () => {
              const result = await deleteTemplateAction(template.id);
              if (!result.ok) {
                toast.error(result.error);
                return false;
              }
              toast.success(result.message);
              router.refresh();
            }}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="rounded-lg border bg-muted/40 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
          {template.body}
        </p>
        <Preview body={template.body} companyName={companyName} />
      </CardContent>
    </Card>
  );
}

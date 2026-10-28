"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EllipsisIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { Field, SubmitButton } from "@/components/app/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { centsToInput } from "@/lib/money";
import { deleteServiceAction, saveServiceAction, setServiceActiveAction } from "@/modules/catalog/actions";
import { serviceSchema } from "@/modules/catalog/schema";

type ServiceValues = {
  id: string;
  name: string;
  description: string;
  defaultPriceCents: number | null;
  returnIntervalDays: number | null;
  active: boolean;
  appointments: number;
};

function ServiceForm({ service, defaultInterval, onDone }: { service?: ServiceValues; defaultInterval: number; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [active, setActive] = useState(service?.active ?? true);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = {
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? ""),
      defaultPrice: String(form.get("defaultPrice") ?? ""),
      returnIntervalDays: String(form.get("returnIntervalDays") ?? ""),
      active,
    };
    const parsed = serviceSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await saveServiceAction(service?.id ?? null, values);
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) setErrors(result.fieldErrors);
        return;
      }
      toast.success(result.message);
      onDone();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError && (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <Field label="Nome do serviço" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" defaultValue={service?.name} aria-invalid={!!errors.name} autoFocus />
      </Field>
      <Field label="Descrição" htmlFor="description" error={errors.description} optional>
        <Textarea id="description" name="description" rows={2} defaultValue={service?.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Retorno recomendado (dias)"
          htmlFor="returnIntervalDays"
          error={errors.returnIntervalDays}
          hint={`Vazio = padrão (${defaultInterval} dias)`}
        >
          <Input
            id="returnIntervalDays"
            name="returnIntervalDays"
            inputMode="numeric"
            defaultValue={service?.returnIntervalDays ?? ""}
            placeholder={String(defaultInterval)}
            aria-invalid={!!errors.returnIntervalDays}
          />
        </Field>
        <Field label="Preço padrão (R$)" htmlFor="defaultPrice" error={errors.defaultPrice} optional>
          <Input
            id="defaultPrice"
            name="defaultPrice"
            inputMode="decimal"
            defaultValue={centsToInput(service?.defaultPriceCents)}
            placeholder="0,00"
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="active" checked={active} onCheckedChange={setActive} />
        <Label htmlFor="active" className="font-normal">
          Serviço ativo (disponível em novos atendimentos)
        </Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <SubmitButton pending={pending} pendingLabel="Salvando...">
          {service ? "Salvar" : "Cadastrar serviço"}
        </SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function ServiceDialog({
  service,
  defaultInterval,
  trigger,
}: {
  service?: ServiceValues;
  defaultInterval: number;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PlusIcon /> Novo serviço
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          <DialogDescription>O intervalo de retorno define quando o cliente aparece na central de retornos.</DialogDescription>
        </DialogHeader>
        {open && <ServiceForm service={service} defaultInterval={defaultInterval} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function ServiceRowActions({ service, defaultInterval }: { service: ServiceValues; defaultInterval: number }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setServiceActiveAction(service.id, !service.active);
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${service.name}`} disabled={pending}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggle}>
            {service.active ? <EyeOffIcon /> : <EyeIcon />} {service.active ? "Desativar" : "Ativar"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDialog
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2Icon /> Excluir
              </DropdownMenuItem>
            }
            title={`Excluir “${service.name}”?`}
            description={
              service.appointments > 0 ? (
                <p>Este serviço tem atendimentos registrados e não pode ser excluído. Desative-o para ocultá-lo de novos atendimentos.</p>
              ) : (
                <p>O serviço será removido. Modelos de mensagem vinculados a ele passarão a valer para todos os serviços.</p>
              )
            }
            confirmLabel="Excluir"
            onConfirm={async () => {
              const result = await deleteServiceAction(service.id);
              if (!result.ok) {
                toast.error(result.error);
                return false;
              }
              toast.success(result.message);
              router.refresh();
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar serviço</DialogTitle>
            <DialogDescription>Alterar o intervalo vale para os próximos atendimentos registrados.</DialogDescription>
          </DialogHeader>
          {editOpen && <ServiceForm service={service} defaultInterval={defaultInterval} onDone={() => setEditOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

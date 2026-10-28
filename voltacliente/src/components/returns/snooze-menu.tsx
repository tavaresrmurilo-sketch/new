"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlarmClockIcon, CalendarIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { addDays, formatDateShort } from "@/lib/dates";
import { snoozeReminderAction } from "@/modules/returns/actions";

const PRESETS = [
  { days: 1, label: "Amanhã" },
  { days: 3, label: "Em 3 dias" },
  { days: 7, label: "Em 1 semana" },
  { days: 15, label: "Em 15 dias" },
  { days: 30, label: "Em 30 dias" },
];

export function SnoozeMenu({ reminderId, today, size = "sm" }: { reminderId: string; today: string; size?: "sm" | "default" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [date, setDate] = useState(addDays(today, 7));

  function snooze(until: string) {
    startTransition(async () => {
      const result = await snoozeReminderAction(reminderId, { until });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Lembrete adiado para ${formatDateShort(until)}.`);
      setCustomOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size={size} disabled={pending}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <AlarmClockIcon />} Adiar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Lembrar novamente</DropdownMenuLabel>
          {PRESETS.map((p) => (
            <DropdownMenuItem key={p.days} onSelect={() => snooze(addDays(today, p.days))}>
              {p.label}
              <span className="ml-auto text-xs text-muted-foreground">{formatDateShort(addDays(today, p.days), false)}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustomOpen(true)}>
            <CalendarIcon /> Escolher data...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adiar lembrete</DialogTitle>
            <DialogDescription>O cliente volta para a central nesta data.</DialogDescription>
          </DialogHeader>
          <Field label="Nova data" htmlFor="snooze-date">
            <Input id="snooze-date" type="date" min={addDays(today, 1)} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => snooze(date)} disabled={pending || !date}>
              Adiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

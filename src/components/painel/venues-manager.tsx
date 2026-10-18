"use client";

import { MapPin, MapPinPlus, PencilLine, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { LocationPicker, type LocationValue, type SavedVenue } from "@/components/map/location-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, EmptyState } from "@/components/ui/misc";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/lib/action";
import { createVenueAction, deleteVenueAction, updateVenueAction } from "@/server/organizations/actions";

type Venue = SavedVenue & { eventsCount: number };

const EMPTY: LocationValue = { venueId: "", venueName: "", address: "", neighborhood: "", city: "", state: "", postalCode: "", lat: null, lng: null };

function toValue(v: Venue): LocationValue {
  return {
    venueId: v.id,
    venueName: v.name,
    address: v.address,
    neighborhood: v.neighborhood ?? "",
    city: v.city,
    state: v.state ?? "",
    postalCode: v.postalCode ?? "",
    lat: v.lat,
    lng: v.lng,
  };
}

/** Cadastro de locais salvos (CRUD) com o seletor de local. */
export function VenuesManager({
  organizationId,
  venues,
  limit,
  planName,
  defaults,
}: {
  organizationId: string;
  venues: Venue[];
  limit: number | null;
  planName: string;
  defaults: { city: string; state: string };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Venue | "new" | null>(null);
  const [value, setValue] = useState<LocationValue>(EMPTY);
  const [state, setState] = useState<ActionState<unknown>>({ status: "idle" });
  const [confirm, setConfirm] = useState<Venue | null>(null);
  const [pending, start] = useTransition();
  const atLimit = limit != null && venues.length >= limit;

  function open(v: Venue | "new") {
    setState({ status: "idle" });
    setValue(v === "new" ? { ...EMPTY, city: defaults.city, state: defaults.state } : toValue(v));
    setEditing(v);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const values = {
      name: value.venueName,
      address: value.address,
      neighborhood: value.neighborhood,
      city: value.city,
      state: value.state,
      postalCode: value.postalCode,
      lat: value.lat ?? undefined,
      lng: value.lng ?? undefined,
    };
    start(async () => {
      const res = editing === "new" ? await createVenueAction({ organizationId, values }) : await updateVenueAction((editing as Venue).id, values);
      if (res.status === "success") {
        toast.success(res.message ?? "Local salvo.");
        setEditing(null);
        router.refresh();
      } else setState(res);
    });
  }

  function remove(v: Venue) {
    start(async () => {
      const res = await deleteVenueAction(v.id);
      if (res.status === "success") {
        toast.success(res.message ?? "Local removido.");
        setConfirm(null);
        router.refresh();
      } else if (res.status === "error") toast.error(res.message);
    });
  }

  const fe = state.status === "error" ? state.fieldErrors ?? {} : {};
  const errors = { venueName: fe.name, address: fe.address, neighborhood: fe.neighborhood, city: fe.city, state: fe.state, postalCode: fe.postalCode, location: fe.lat ?? fe.lng };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {limit == null ? `${venues.length} ${venues.length === 1 ? "local salvo" : "locais salvos"}` : `${venues.length} de ${limit} locais no plano ${planName}`}
          {atLimit && (
            <>
              {" · "}
              <Link href="/painel/plano" className="font-semibold text-primary hover:underline">
                Fazer upgrade
              </Link>
            </>
          )}
        </p>
        {venues.length > 0 && (
          <Button variant="primary" onClick={() => open("new")} disabled={atLimit} className="self-start">
            <MapPinPlus /> Novo local
          </Button>
        )}
      </div>

      {venues.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={<MapPin />}
            title="Salve os lugares onde você faz eventos"
            description="Com o endereço e o pino guardados, criar um evento no mesmo lugar leva um toque."
            action={
              <Button variant="primary" onClick={() => open("new")} disabled={atLimit}>
                <MapPinPlus /> Adicionar local
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {venues.map((v) => (
            <li key={v.id} className="flex flex-col rounded-3xl border border-border bg-surface p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary">
                  <MapPin className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold tracking-tight">{v.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{[v.address, v.neighborhood].filter(Boolean).join(" · ")}</p>
                  <p className="text-sm text-muted-foreground">{[v.city, v.state].filter(Boolean).join(" – ")}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-subtle-foreground">
                  {v.eventsCount ? `${v.eventsCount} ${v.eventsCount === 1 ? "evento" : "eventos"}` : "Nenhum evento ainda"}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => open(v)} aria-label={`Editar ${v.name}`}>
                    <PencilLine />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setConfirm(v)} aria-label={`Remover ${v.name}`} className="text-danger hover:text-danger">
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {atLimit && venues.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-dashed border-border-strong p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-semibold">Você chegou ao limite de locais do plano {planName}.</span>{" "}
            <span className="text-muted-foreground">Eventos podem usar outros endereços normalmente — o limite vale só para locais salvos.</span>
          </p>
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link href="/painel/plano">
              <Sparkles /> Ver planos
            </Link>
          </Button>
        </div>
      )}

      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Novo local" : "Editar local"} className="sm:max-w-2xl">
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <FormMessage state={state} />
            {editing != null && <LocationPicker idPrefix="venue" value={value} onChange={(p) => setValue((v) => ({ ...v, ...p }))} errors={errors} />}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                {editing === "new" ? "Salvar local" : "Salvar alterações"}
              </Button>
            </div>
            {editing !== "new" && editing && <p className="text-xs text-muted-foreground">Alterar o local não muda eventos já criados — eles guardam o endereço que tinham.</p>}
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent title="Remover local?" description={confirm?.name}>
          <p className="text-[15px] text-muted-foreground">Os eventos que já usam este endereço continuam iguais. Você só deixa de vê-lo em “Locais salvos”.</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button variant="danger" loading={pending} onClick={() => confirm && remove(confirm)}>
              <Trash2 /> Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

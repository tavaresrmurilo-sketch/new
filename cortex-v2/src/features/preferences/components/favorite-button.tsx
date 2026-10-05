"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import { toggleFavoriteAction } from "../actions";

export function FavoriteButton({ entityType, entityId, label, href, initial }: { entityType: "client" | "project" | "report" | "page" | "opportunity"; entityId: string; label: string; href: string; initial: boolean }) {
  const [fav, setFav] = React.useState(initial);
  const { run, pending } = useAction(toggleFavoriteAction, { onSuccess: (d) => setFav(d.favorite) });
  return (
    <Button
      variant="outline"
      size="icon-sm"
      disabled={pending}
      aria-pressed={fav}
      aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      title={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      onClick={() => void run({ entityType, entityId, label, href })}
    >
      <Star className={cn(fav && "fill-amber-400 text-amber-500")} />
    </Button>
  );
}

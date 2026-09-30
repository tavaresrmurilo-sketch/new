"use client";

import { useTransition } from "react";
import { moderateReview } from "@/app/admin/actions/catalog";
import { Button } from "@/components/ui/button";

export function ReviewActions({ id, status }: { id: string; status: "PENDING" | "APPROVED" | "HIDDEN" }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {status !== "APPROVED" && (
        <Button size="sm" disabled={pending} onClick={() => start(() => moderateReview(id, "APPROVED"))}>
          Publicar
        </Button>
      )}
      {status !== "HIDDEN" && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => moderateReview(id, "HIDDEN"))}>
          Ocultar
        </Button>
      )}
    </div>
  );
}

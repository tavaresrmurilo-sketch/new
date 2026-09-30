"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleProductFlag, updateStock } from "@/app/admin/actions/products";
import { cn } from "@/lib/cn";

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-5 w-9 rounded-full transition-colors disabled:opacity-50", checked ? "bg-accent" : "bg-line-strong")}
    >
      <span className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
    </button>
  );
}

/** Controles rápidos da listagem: estoque, ativo e destaque sem abrir o produto. */
export function ProductRowControls(props: { id: string; stock: number; allowBackorder: boolean; active: boolean; featured: boolean; tdClass: string }) {
  const [stock, setStock] = useState(String(props.stock));
  const [active, setActive] = useState(props.active);
  const [featured, setFeatured] = useState(props.featured);
  const [pending, start] = useTransition();

  return (
    <>
      <td className={props.tdClass}>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={stock}
            aria-label="Estoque"
            onChange={(e) => setStock(e.target.value)}
            onBlur={() => {
              const n = Number(stock);
              if (n === props.stock) return;
              start(async () => {
                const r = await updateStock(props.id, n);
                if (!r.ok) {
                  toast.error(r.error ?? "Erro");
                  setStock(String(props.stock));
                } else toast.success("Estoque atualizado");
              });
            }}
            className="h-8 w-20 rounded border border-line-strong px-2 text-sm tabular-nums focus:border-accent focus:outline-none"
          />
          {Number(stock) <= 0 && <span className="text-xs text-muted">{props.allowBackorder ? "sob encomenda" : "esgotado"}</span>}
        </div>
      </td>
      <td className={props.tdClass}>
        <Switch
          checked={active}
          label="Ativo"
          disabled={pending}
          onChange={(v) => {
            setActive(v);
            start(() => toggleProductFlag(props.id, "active", v));
          }}
        />
      </td>
      <td className={props.tdClass}>
        <Switch
          checked={featured}
          label="Destaque"
          disabled={pending}
          onChange={(v) => {
            setFeatured(v);
            start(() => toggleProductFlag(props.id, "featured", v));
          }}
        />
      </td>
    </>
  );
}

"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { formatBRL } from "@/lib/money";
import type { CartLineView } from "@/lib/cart/types";
import { QuantityStepper } from "@/components/ui/quantity";
import { useCart } from "./cart-provider";
import { cn } from "@/lib/cn";
import { CustomThumb } from "./custom-thumb";

export function CartLine({ line, compact = false }: { line: CartLineView; compact?: boolean }) {
  const { setQuantity, remove, pending } = useCart();
  const image = line.imageUrl ? (
    <img src={line.imageUrl} alt="" width={96} height={96} className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <CustomThumb color={line.colorHex ?? "#5b3df5"} />
  );

  return (
    <li className={cn("flex gap-3.5", compact ? "py-4" : "py-5")}>
      <div className={cn("shrink-0 overflow-hidden rounded-lg border border-line bg-sunken", compact ? "h-20 w-20" : "h-24 w-24 sm:h-28 sm:w-28")}>
        {line.href ? (
          <Link href={line.href} tabIndex={-1} aria-hidden="true">
            {image}
          </Link>
        ) : (
          image
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {line.href ? (
              <Link href={line.href} className="font-medium leading-snug text-ink hover:text-accent">
                {line.name}
              </Link>
            ) : (
              <p className="font-medium leading-snug">{line.name}</p>
            )}
            <dl className="mt-1 space-y-0.5 text-[0.8rem] text-muted">
              {line.variantName && (
                <div className="flex items-center gap-1.5">
                  <dt className="sr-only">Cor</dt>
                  {line.colorHex && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: line.colorHex }} />}
                  <dd>{line.variantName}</dd>
                </div>
              )}
              {line.options.map((option) => (
                <div key={option.label} className="flex gap-1 break-words">
                  <dt>{option.label}:</dt>
                  <dd className="min-w-0 text-ink-2">{option.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="shrink-0 text-right font-semibold tabular-nums">{formatBRL(line.totalCents)}</p>
        </div>

        {line.issue && <p className="mt-2 rounded-md bg-danger-soft px-2.5 py-1.5 text-[0.8rem] text-danger">{line.issue}</p>}

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <QuantityStepper
            size="sm"
            value={line.quantity}
            min={line.minQuantity}
            max={Math.max(line.maxQuantity, line.quantity)}
            onChange={(q) => setQuantity(line.id, q)}
            disabled={pending}
          />
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted tabular-nums sm:inline">
              {formatBRL(line.unitPriceCents)} cada{line.setupFeeCents > 0 && ` + ${formatBRL(line.setupFeeCents)} modelagem`}
            </span>
            <button
              type="button"
              onClick={() => remove(line.id)}
              className="grid h-9 w-9 place-items-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger"
              aria-label={`Remover ${line.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

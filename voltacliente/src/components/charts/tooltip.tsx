"use client";

type Entry = { name?: string | number; value?: number | string; color?: string; dataKey?: string | number };

/** Tooltip padrão: valor em destaque, nome da série secundário, chave em linha. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  names,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  formatValue?: (value: number, key: string) => string;
  names?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-muted-foreground">{label}</p>
      <div className="space-y-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? "");
          const value = Number(entry.value ?? 0);
          return (
            <div key={key} className="flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: entry.color }} />
              <span className="font-semibold text-foreground tabular-nums">{formatValue ? formatValue(value, key) : value}</span>
              <span className="text-muted-foreground">{names?.[key] ?? entry.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

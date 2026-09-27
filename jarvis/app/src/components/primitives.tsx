import { memo, useEffect, useId, useState } from "react";

/** Radial instrument gauge (SVG arc). `value` null renders as N/A, never as zero. */
export const Gauge = memo(function Gauge({ value, label, sub, size = 64, warn = 85 }: { value: number | null; label: string; sub?: string; size?: number; warn?: number }) {
  const r = size / 2 - 5;
  const c = size / 2;
  const start = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const end = start + (sweep * v) / 100;
  const arc = (a0: number, a1: number) => {
    const x0 = c + r * Math.cos(a0);
    const y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1);
    const y1 = c + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const hot = value !== null && value >= warn;
  return (
    <div className="gauge" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={value ?? undefined} aria-valuetext={value === null ? "indisponível" : `${Math.round(v)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <path d={arc(start, start + sweep)} className="gauge__track" />
        {value !== null && v > 0.5 && <path d={arc(start, end)} className={`gauge__value${hot ? " is-hot" : ""}`} />}
      </svg>
      <div className="gauge__center">
        <span className={`t-num gauge__num${value === null ? " is-na" : ""}`}>{value === null ? "N/A" : Math.round(v)}</span>
        {value !== null && <span className="gauge__unit">%</span>}
      </div>
      <div className="gauge__label">
        <span className="t-label">{label}</span>
        {sub && <span className="t-xs t-muted gauge__sub">{sub}</span>}
      </div>
    </div>
  );
});

/** Tiny line chart of the recent history. Auto-scales unless `max` is given. */
export const Sparkline = memo(function Sparkline({ data, max, width = 120, height = 26, label }: { data: number[]; max?: number; width?: number; height?: number; label: string }) {
  const id = useId();
  if (data.length < 2) return <div className="spark spark--empty" style={{ width, height }} aria-hidden="true" />;
  const top = max ?? Math.max(1, ...data);
  const step = width / (data.length - 1);
  const pts = data.map((d, i) => `${(i * step).toFixed(1)},${(height - (Math.min(top, d) / top) * (height - 2) - 1).toFixed(1)}`);
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--c-primary)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--c-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(" ")} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(" ")} fill="none" stroke="var(--c-primary)" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
});

/**
 * Switch with optimistic feedback: flips instantly, then reverts if the handler
 * reports failure (returns/resolves to null or false).
 */
export function Toggle({ checked, onChange, label, hint, disabled, id, className }: { checked: boolean; onChange: (v: boolean) => unknown; label: string; hint?: string; disabled?: boolean; id?: string; className?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const [local, setLocal] = useState(checked);
  useEffect(() => setLocal(checked), [checked]);
  const change = async (v: boolean) => {
    setLocal(v);
    const res = await onChange(v);
    if (res === null || res === false) setLocal(checked);
  };
  return (
    <div className={`setting-row ${className ?? ""}`}>
      <label className="toggle" htmlFor={fid}>
        <input id={fid} type="checkbox" role="switch" checked={local} disabled={disabled} onChange={(e) => void change(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children && <div className="empty__body t-sm t-muted">{children}</div>}
    </div>
  );
}

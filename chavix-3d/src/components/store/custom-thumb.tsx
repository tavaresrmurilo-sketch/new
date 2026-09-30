/** Miniatura desenhada para itens personalizados (que não têm foto de catálogo). */
export function CustomThumb({ color, label = "ABC" }: { color: string; label?: string }) {
  return (
    <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden="true">
      <rect width="96" height="96" fill="#ececf0" />
      {[5, 4, 3, 2, 1].map((i) => (
        <rect key={i} x="20" y={36 + i * 1.6} width="56" height="26" rx="8" fill={color} style={{ filter: `brightness(${i % 2 ? 0.62 : 0.7})` }} />
      ))}
      <rect x="20" y="36" width="56" height="26" rx="8" fill={color} />
      <rect x="20" y="36" width="56" height="10" rx="5" fill="#fff" opacity=".12" />
      <circle cx="30" cy="49" r="3.6" fill="#ececf0" />
      <circle cx="30" cy="33" r="11" fill="none" stroke="#9d9da8" strokeWidth="2.5" />
      <text x="55" y="53" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="10" fontWeight="700" fill="#fff" opacity=".92">
        {label}
      </text>
    </svg>
  );
}

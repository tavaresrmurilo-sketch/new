import * as React from "react";

/** Renderizador markdown mínimo e seguro (negrito, itálico, listas, títulos) — sem HTML arbitrário. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={`${keyBase}-${i++}`} className="text-muted-foreground">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      out.push(
        <ul key={`ul-${k}`}>
          {list.map((l, i) => (
            <li key={i}>{inline(l, `li-${k}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, idx) => {
    const t = line.trimEnd();
    if (/^\s*[-•]\s+/.test(t)) {
      list.push(t.replace(/^\s*[-•]\s+/, ""));
      return;
    }
    flush(idx);
    if (!t.trim()) return;
    if (t.startsWith("### ")) out.push(<h3 key={idx}>{inline(t.slice(4), `h-${idx}`)}</h3>);
    else out.push(<p key={idx}>{inline(t, `p-${idx}`)}</p>);
  });
  flush(lines.length);
  return <div className="prose-cortex text-sm leading-relaxed text-foreground/90">{out}</div>;
}

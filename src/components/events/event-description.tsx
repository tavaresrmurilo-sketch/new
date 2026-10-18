"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const TRAILING = /[.,;:!?…'"”’»]+$/;

/** Separa a pontuação final de uma URL ("site.com." → "site.com" + "."), mantendo parênteses balanceados. */
function splitTrailing(raw: string): [string, string] {
  let url = raw;
  let tail = "";
  for (;;) {
    const m = TRAILING.exec(url);
    if (m) {
      tail = m[0] + tail;
      url = url.slice(0, -m[0].length);
      continue;
    }
    if (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
      tail = `)${tail}`;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return [url, tail];
}

/** Só http(s), com domínio e sem credenciais. */
export function safeLinkHref(text: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function displayUrl(text: string): string {
  const t = text.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

/** Texto do usuário com URLs viradas em links seguros (sem HTML). */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const [url, tail] = splitTrailing(m[0]);
    const href = url.length > 3 ? safeLinkHref(url) : null;
    if (start > last) out.push(text.slice(last, start));
    if (href) {
      out.push(
        <a
          key={`${start}-${url}`}
          href={href}
          target="_blank"
          rel="nofollow ugc noopener noreferrer"
          className="font-semibold [overflow-wrap:anywhere] text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        >
          {displayUrl(url)}
        </a>,
      );
      if (tail) out.push(tail);
    } else {
      out.push(m[0]);
    }
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Descrição do evento (ou bio): preserva parágrafos e quebras de linha,
 * transforma URLs em links seguros e recolhe textos longos com "Ler mais".
 */
export function EventDescription({ text, className, collapseAfter = 640 }: { text: string; className?: string; collapseAfter?: number }) {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim());
  const long = clean.length > collapseAfter || clean.split("\n").length > 12;
  const [expanded, setExpanded] = useState(false);
  const id = useId();

  if (!paragraphs.length) return null;
  return (
    <div className={className}>
      <div
        id={id}
        className={cn(
          "relative space-y-3 text-[15px] leading-relaxed break-words text-foreground/90",
          long && !expanded && "max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]",
        )}
      >
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {linkify(p)}
          </p>
        ))}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={id}
          className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full text-sm font-bold text-primary hover:underline"
        >
          {expanded ? "Ler menos" : "Ler mais"}
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

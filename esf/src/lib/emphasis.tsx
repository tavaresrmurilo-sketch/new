import { Fragment } from "react";

export interface Chunk {
  text: string;
  em: boolean;
}

/** Converte "texto *destaque*" em pedaços; trechos entre * viram ênfase. */
export function parseEmphasis(text: string): Chunk[] {
  return text
    .split("*")
    .map((part, i) => ({ text: part, em: i % 2 === 1 }))
    .filter((c) => c.text.length > 0);
}

/** Palavras individuais (preservando a ênfase) — usado nas revelações palavra a palavra. */
export function wordsOf(text: string): Chunk[] {
  return parseEmphasis(text).flatMap((chunk) =>
    chunk.text
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ text: w, em: chunk.em })),
  );
}

/** Renderiza texto com trechos em serifa itálica. */
export function Emphasis({ text, emClassName = "font-serif italic font-normal" }: { text: string; emClassName?: string }) {
  return (
    <>
      {parseEmphasis(text).map((c, i) =>
        c.em ? (
          <em key={i} className={emClassName}>
            {c.text}
          </em>
        ) : (
          <Fragment key={i}>{c.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Texto puro (sem marcações) — útil para atributos e metadata. */
export function plain(text: string) {
  return text.replace(/\*/g, "");
}

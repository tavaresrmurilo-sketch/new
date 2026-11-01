import { Fragment, type CSSProperties, type JSX } from "react";
import { wordsOf } from "@/lib/emphasis";

/** Título com entrada cinematográfica: cada palavra sobe por trás de uma máscara. */
export function RevealTitle({
  text,
  as: Tag = "h2",
  id,
  className,
  delay = 0,
}: {
  text: string;
  as?: keyof Pick<JSX.IntrinsicElements, "h1" | "h2" | "h3" | "p">;
  id?: string;
  className?: string;
  delay?: number;
}) {
  const words = wordsOf(text);
  return (
    <Tag id={id} className={className} data-reveal="lines" style={{ "--d": `${delay}ms` } as CSSProperties}>
      {words.map((w, i) => (
        <Fragment key={i}>
          <span className="ln">
            {w.em ? (
              <em style={{ "--i": i } as CSSProperties}>{w.text}</em>
            ) : (
              <span style={{ "--i": i } as CSSProperties}>{w.text}</span>
            )}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}

/** Rótulo de seção: "01 — Quem somos". */
export function Eyebrow({ index, children, className }: { index: string; children: React.ReactNode; className?: string }) {
  return (
    <p className={`eyebrow ${className ?? ""}`} data-reveal>
      <span className="idx">{index}</span>
      <span>{children}</span>
    </p>
  );
}

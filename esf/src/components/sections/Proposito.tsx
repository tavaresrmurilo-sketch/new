"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { purpose } from "@/content/site";
import { PillarGlyphArt } from "@/components/icons/Art";
import { Eyebrow, RevealTitle } from "@/components/ui/RevealTitle";

export function Proposito() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Em telas sem hover (celular), o pilar visível no centro da tela fica ativo.
  useEffect(() => {
    const list = listRef.current;
    if (!list || window.matchMedia("(hover: hover) and (min-width: 1024px)").matches) return;
    const items = Array.from(list.children) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(items.indexOf(e.target as HTMLElement));
      },
      { rootMargin: "-40% 0px -45% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const columns = Object.fromEntries(
    purpose.pillars.map((_, i) => [`--c${i}`, i === active ? "1.85fr" : "1fr"]),
  ) as CSSProperties;

  return (
    <section id="proposito" className="section on-dark" data-tone="dark" aria-labelledby="proposito-title">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Eyebrow index="02">{purpose.eyebrow}</Eyebrow>
            <RevealTitle id="proposito-title" text={purpose.title} className="display mt-8" />
          </div>
          <p className="lead text-mist lg:col-span-4 lg:col-start-9" data-reveal>
            {purpose.lead}
          </p>
        </div>

        <ul ref={listRef} className="pillars mt-14 md:mt-20" style={columns} data-reveal>
          {purpose.pillars.map((pillar, i) => {
            const isActive = i === active;
            const textId = `pilar-${pillar.glyph}`;
            return (
              <li
                key={pillar.title}
                className="pillar"
                data-active={isActive}
                onMouseEnter={() => setActive(i)}
              >
                <div className="flex items-start justify-between gap-4">
                  <PillarGlyphArt glyph={pillar.glyph} className="pillar-glyph" />
                  <span className="font-serif text-2xl italic text-ember" aria-hidden="true">
                    0{i + 1}
                  </span>
                </div>
                <div className="pillar-body">
                  <h3 className="pillar-title">
                    <button
                      type="button"
                      className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                      aria-expanded={isActive}
                      aria-controls={textId}
                      onClick={() => setActive(i)}
                      onFocus={() => setActive(i)}
                    >
                      {pillar.title}
                    </button>
                  </h3>
                  <p id={textId} className="pillar-text mt-4">
                    {pillar.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

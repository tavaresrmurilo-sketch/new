"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { story } from "@/content/site";
import { Eyebrow, RevealTitle } from "@/components/ui/RevealTitle";

export function Historia() {
  const listRef = useRef<HTMLOListElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const list = listRef.current;
    const fill = fillRef.current;
    if (!list || !fill) return;
    const chapters = Array.from(list.querySelectorAll<HTMLElement>("[data-chapter]"));
    const full = document.documentElement.dataset.motion === "full";

    if (!full) {
      chapters.forEach((c) => (c.dataset.lit = "true"));
      fill.style.transform = "scaleY(1)";
      return;
    }

    let disposed = false;
    let revert: (() => void) | undefined;
    // só carrega e mede quando a seção se aproxima da viewport
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        void init();
      },
      { rootMargin: "100% 0px" },
    );
    near.observe(list);
    const init = async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        // a linha narrativa acompanha o scroll nos dois sentidos
        gsap.fromTo(
          fill,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: "none",
            scrollTrigger: { trigger: list, start: "top 62%", end: "bottom 62%", scrub: 0.6 },
          },
        );
        chapters.forEach((chapter, i) => {
          ScrollTrigger.create({
            trigger: chapter,
            start: "top 62%",
            end: "bottom 62%",
            onToggle: (self) => {
              if (self.isActive) setCurrent(i);
            },
            onEnter: () => (chapter.dataset.lit = "true"),
            onLeaveBack: () => (chapter.dataset.lit = "false"),
          });
        });
      }, list);
      revert = () => ctx.revert();
    };
    return () => {
      disposed = true;
      near.disconnect();
      revert?.();
    };
  }, []);

  return (
    <section id="historia" className="section on-dark overflow-x-clip" data-tone="dark" aria-labelledby="historia-title">
      <div className="mx-auto grid max-w-[88rem] gap-14 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <Eyebrow index="04">{story.eyebrow}</Eyebrow>
            <RevealTitle id="historia-title" text={story.title} className="display mt-8" />
            <p className="lead mt-8 max-w-md text-mist" data-reveal>
              {story.lead}
            </p>
            <div className="relative mt-12 hidden h-[10rem] lg:block" aria-hidden="true">
              {story.chapters.map((c, i) => (
                <span
                  key={c.numeral}
                  className="absolute left-0 top-0 font-serif text-[9rem] italic leading-none text-ember transition-all duration-700 ease-[var(--ease-out-expo)]"
                  style={{
                    opacity: i === current ? 1 : 0,
                    transform: `translate3d(0, ${i === current ? 0 : i < current ? -24 : 24}px, 0)`,
                  }}
                >
                  {c.numeral}
                </span>
              ))}
            </div>
          </div>
        </div>

        <ol ref={listRef} className="relative lg:col-span-6 lg:col-start-7 lg:pt-2">
          <span className="story-line" aria-hidden="true">
            <span ref={fillRef} className="story-line-fill" />
          </span>
          {story.chapters.map((c, i) => (
            <li key={c.numeral} className="story-chapter" data-chapter data-lit={i === 0 ? "true" : "false"}>
              <span className="story-node" aria-hidden="true" />
              <div className="story-content" style={{ "--d": "0ms" } as CSSProperties}>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-ember">
                  Capítulo <span className="font-serif text-base normal-case italic tracking-normal">{c.numeral}</span>
                </p>
                <h3 className="mt-3 text-[1.7rem] font-semibold leading-tight tracking-[-0.03em] md:text-[2.1rem]">
                  {c.title}
                </h3>
                <p className="mt-4 max-w-xl text-mist md:text-lg">{c.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

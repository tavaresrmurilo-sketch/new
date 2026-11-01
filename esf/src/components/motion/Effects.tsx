"use client";

import { useEffect } from "react";

/**
 * Microinterações globais e leves (sem dependências):
 * - [data-reveal]: revela elementos ao entrarem na viewport (uma única vez);
 * - [data-tilt]: inclinação 3D sutil que acompanha o ponteiro;
 * - [data-glow]: brilho radial que segue o ponteiro (variáveis --mx/--my).
 * Tudo é desativado quando o visitante prefere menos movimento.
 */
export function Effects() {
  useEffect(() => {
    const full = document.documentElement.dataset.motion === "full";
    const cleanups: (() => void)[] = [];

    /* ---------- revelações ---------- */
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!full || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-in"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
      );
      targets.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    }

    if (!full || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return () => cleanups.forEach((fn) => fn());
    }

    /* ---------- inclinação ---------- */
    document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((el) => {
      const target = el.querySelector<HTMLElement>("[data-tilt-target]") ?? el;
      let frame = 0;
      const onMove = (e: PointerEvent) => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          target.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
          target.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
        });
      };
      const onLeave = () => {
        cancelAnimationFrame(frame);
        target.style.setProperty("--ry", "0deg");
        target.style.setProperty("--rx", "0deg");
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      });
    });

    /* ---------- brilho que segue o ponteiro ---------- */
    document.querySelectorAll<HTMLElement>("[data-glow]").forEach((el) => {
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      };
      el.addEventListener("pointermove", onMove);
      cleanups.push(() => el.removeEventListener("pointermove", onMove));
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { introScenes, introSymbols, site } from "@/content/site";
import { wordsOf } from "@/lib/emphasis";
import { yieldToMain } from "@/lib/yield";
import { LogoMark } from "@/components/brand/Logo";
import { computeLayout, HEADER_LIGHT_AT, SCENE_STARTS, SCENE_TARGETS, T, type Layout, type Range } from "./globe/scene";
import type { FrameInfo, GlobeRenderer } from "./globe/renderer";

const phraseScenes = introScenes.slice(0, 4);

function Phrase({ index, lines }: { index: number; lines: readonly string[] }) {
  return (
    <p className="intro-phrase" data-scene={index}>
      {lines.map((line, li) => (
        <span className="ln" key={li}>
          {wordsOf(line).map((w, wi, arr) => (
            <span key={wi}>
              <span className={w.em ? "w em" : "w"}>{w.text}</span>
              {wi < arr.length - 1 ? " " : null}
            </span>
          ))}
        </span>
      ))}
    </p>
  );
}

/** Posição de um elemento relativa a um ancestral posicionado (ignora transforms). */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const dur = (r: Range) => r[1] - r[0];

/**
 * Abertura "Uma jornada sem fronteiras": cinco cenas controladas exclusivamente pela rolagem.
 * O palco fica fixo (sticky) enquanto a seção alta rola; o progresso da rolagem (suavizado pelo
 * scrub do GSAP) alimenta tanto os textos quanto o renderizador WebGL. Nada se move sozinho.
 */
export function Intro() {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!section || !stage || !canvas) return;

    const html = document.documentElement;
    const full = html.dataset.motion === "full";
    const lite =
      window.matchMedia("(max-width: 767px), (pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;

    let disposed = false;
    const state = { p: 0 };
    let renderer: GlobeRenderer | null = null;
    let layout: Layout = computeLayout(canvas.clientWidth || 1, canvas.clientHeight || 1);
    let pendingDraw = 0;
    let visible = true;
    let firstFrame = true;
    const cleanups: (() => void)[] = [];
    const symbols = Array.from(stage.querySelectorAll<HTMLElement>("[data-symbol]"));

    /* ---------------- layout ---------------- */

    const positionLabels = () => {
      symbols.forEach((el, i) => {
        const [x, y] = layout.glyphs[i];
        el.style.left = `${x}px`;
        el.style.top = `${y + layout.glyphR + (layout.portrait ? 8 : 14)}px`;
      });
    };

    const measure = () => {
      const w = canvas.clientWidth || stage.clientWidth;
      const h = canvas.clientHeight || stage.clientHeight;
      let logo: Layout["logo"] | null = null;
      const logoEl = logoRef.current;
      if (logoEl && full && logoEl.offsetWidth > 0) {
        const pos = offsetWithin(logoEl, stage);
        logo = { x: pos.x + logoEl.offsetWidth / 2, y: pos.y + logoEl.offsetHeight / 2, half: logoEl.offsetWidth / 2 };
      }
      layout = computeLayout(w, h, logo);
      positionLabels();
      if (renderer) {
        renderer.resize(w, h, window.devicePixelRatio || 1);
        renderer.setLayout(layout);
      }
      requestDraw();
    };

    /* ---------------- WebGL ---------------- */

    const setWebgl = (value: "loading" | "deferred" | "on" | "off") => {
      section.dataset.webgl = value;
    };

    const updateMarker = (info: FrameInfo) => {
      const marker = markerRef.current;
      if (!marker) return;
      const alpha = info.marker.visible ? info.params.marker : 0;
      marker.style.opacity = alpha.toFixed(3);
      marker.style.visibility = alpha > 0.01 ? "visible" : "hidden";
      if (alpha > 0.01) marker.style.transform = `translate3d(${info.marker.x.toFixed(1)}px, ${info.marker.y.toFixed(1)}px, 0)`;
    };

    const draw = () => {
      if (!renderer) return;
      if (renderer.isLost) {
        setWebgl("off");
        return;
      }
      const info = renderer.render(state.p);
      if (!info) return;
      updateMarker(info);
      if (firstFrame) {
        firstFrame = false;
        setWebgl("on");
      }
    };

    /** Desenha um quadro no próximo frame — só quando algo mudou (rolagem ou tamanho). */
    function requestDraw() {
      if (pendingDraw || !renderer || !visible || document.hidden) return;
      pendingDraw = requestAnimationFrame(() => {
        pendingDraw = 0;
        draw();
      });
    }

    // Sem aceleração por GPU, o WebGL só começa quando o visitante interage.
    const engageEvents = ["pointermove", "pointerdown", "wheel", "touchstart", "keydown", "scroll"] as const;
    let onEngaged: () => void = () => {};
    const engagedOnce = new Promise<void>((resolve) => (onEngaged = resolve));
    const engage = () => {
      engageEvents.forEach((ev) => window.removeEventListener(ev, engage));
      onEngaged();
    };
    engageEvents.forEach((ev) => window.addEventListener(ev, engage, { passive: true }));
    cleanups.push(() => engageEvents.forEach((ev) => window.removeEventListener(ev, engage)));

    const initRenderer = async () => {
      setWebgl("loading");
      try {
        const { GlobeRenderer, probeWebGL } = await import("./globe/renderer");
        if (disposed) return;
        const support = probeWebGL();
        if (support === "none") {
          setWebgl("off");
          return;
        }
        if (support === "software") {
          section.dataset.glFallback = "true";
          if (full) {
            setWebgl("deferred");
            await engagedOnce;
            if (disposed) return;
            setWebgl("loading");
          }
        }
        renderer = await GlobeRenderer.create(
          canvas,
          { lite: lite || support === "software", economy: support === "software", onContextLost: () => setWebgl("off") },
          () => disposed,
        );
      } catch (error) {
        if (process.env.NODE_ENV !== "production") console.warn("[ESF] Falha ao iniciar a abertura:", error);
        renderer = null;
      }
      if (disposed) return;
      if (!renderer) {
        setWebgl("off");
        return;
      }
      measure();
      draw();
    };

    const idle = (cb: () => void) => {
      const w = window as Window & Partial<Pick<Window, "requestIdleCallback" | "cancelIdleCallback">>;
      if (typeof w.requestIdleCallback === "function") {
        const id = w.requestIdleCallback(cb, { timeout: 900 });
        cleanups.push(() => w.cancelIdleCallback?.(id));
      } else {
        const id = window.setTimeout(cb, 120);
        cleanups.push(() => window.clearTimeout(id));
      }
    };
    idle(() => void initRenderer());

    /* ---------------- observadores ---------------- */

    const ro = new ResizeObserver(() => measure());
    ro.observe(canvas);
    cleanups.push(() => ro.disconnect());

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) requestDraw();
      },
      { rootMargin: "80px 0px" },
    );
    io.observe(section);
    cleanups.push(() => io.disconnect());

    const onVisibility = () => !document.hidden && requestDraw();
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    if (document.fonts?.ready) void document.fonts.ready.then(() => !disposed && measure());

    /* ---------------- timeline de scroll ---------------- */

    if (full) {
      void (async () => {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
        if (disposed) return;
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });

        const q = <E extends Element = HTMLElement>(sel: string) => Array.from(stage.querySelectorAll<E>(sel));
        const phrases = q("[data-scene]");
        const progressItems = q("[data-progress-item]");
        const fill = stage.querySelector<HTMLElement>("[data-progress-fill]");
        const mobileLabel = stage.querySelector<HTMLElement>("[data-progress-label]");
        let activeScene = -1;
        let tone = "";

        // A timeline é montada em blocos curtos (cedendo a thread entre eles) e só então
        // ligada ao scroll — nenhuma tarefa longa durante o carregamento.
        const ctx = gsap.context(() => {}, section);
        cleanups.push(() => ctx.revert());
        const step = async (fn: () => void) => {
          if (disposed) return false;
          ctx.add(fn);
          await yieldToMain();
          return !disposed;
        };

        let tl!: ReturnType<typeof gsap.timeline>;
        const enter = (el: Element, r: Range) => {
          tl.fromTo(
            el.querySelectorAll(".w"),
            { y: 0, yPercent: 115, opacity: 0 },
            { y: 0, yPercent: 0, opacity: 1, duration: dur(r) * 0.62, stagger: { amount: dur(r) * 0.38 }, ease: "power3.out" },
            r[0],
          );
        };
        const exit = (el: Element, r: Range) => {
          tl.to(el, { opacity: 0, y: -40, duration: dur(r), ease: "power1.in" }, r[0]);
        };

        const ok =
          (await step(() => {
            tl = gsap.timeline({
              paused: true,
              defaults: { ease: "none" },
              onUpdate: () => {
                const p = state.p;
                requestDraw();
                if (fill) fill.style.transform = `scaleY(${p.toFixed(4)})`;
                let idx = 0;
                for (let i = 0; i < SCENE_STARTS.length; i++) if (p >= SCENE_STARTS[i]) idx = i;
                if (idx !== activeScene) {
                  activeScene = idx;
                  progressItems.forEach((el, i) => el.toggleAttribute("data-active", i === idx));
                  if (mobileLabel) mobileLabel.textContent = `0${idx + 1} — ${introScenes[idx].label}`;
                }
                const nextTone = p >= HEADER_LIGHT_AT ? "light" : "dark";
                if (nextTone !== tone) {
                  tone = nextTone;
                  stage.dataset.tone = nextTone;
                  section.dataset.tone = nextTone;
                  window.dispatchEvent(new Event("esf:tone"));
                }
              },
            });
            // progresso bruto para o WebGL (já suavizado pelo scrub)
            tl.to(state, { p: 1, duration: 1 }, 0);
            tl.to("[data-cue]", { autoAlpha: 0, y: 12, duration: dur(T.cueOut) }, T.cueOut[0]);
            exit(phrases[0], T.t1Out);
            enter(phrases[1], T.t2In);
            exit(phrases[1], T.t2Out);
          })) &&
          (await step(() => {
            enter(phrases[2], T.t3In);
            exit(phrases[2], T.t3Out);
            enter(phrases[3], T.t4In);
            exit(phrases[3], T.t4Out);
            tl.to("[data-scrim]", { opacity: 0, duration: dur(T.t1Out) }, T.t1Out[0]);
            tl.fromTo("[data-scrim-bottom]", { opacity: 0 }, { opacity: 1, duration: 0.05 }, T.t2In[0] - 0.03);
            tl.to("[data-scrim-bottom]", { opacity: 0, duration: 0.04 }, T.t2Out[1]);
          })) &&
          (await step(() => {
            tl.fromTo(
              "[data-symbol]",
              { autoAlpha: 0, x: 0, y: 10, xPercent: -50 },
              { autoAlpha: 1, x: 0, y: 0, xPercent: -50, duration: dur(T.labels) * 0.6, stagger: dur(T.labels) * 0.12, ease: "power2.out" },
              T.labels[0],
            );
            tl.to("[data-symbol]", { autoAlpha: 0, duration: dur(T.labelsOut) }, T.labelsOut[0]);
            // camadas de fundo (usadas apenas quando o WebGL não está disponível)
            tl.fromTo("[data-bg-warm]", { opacity: 0 }, { opacity: 1, duration: dur(T.dawn) }, T.dawn[0]);
            tl.fromTo("[data-bg-day]", { opacity: 0 }, { opacity: 1, duration: dur(T.day) }, T.day[0]);
            tl.to("[data-fallback-globe]", { opacity: 0, scale: 1.6, duration: dur(T.morph) }, T.morph[0]);
          })) &&
          (await step(() => {
            // revelação da ESF
            tl.fromTo("[data-reveal-logo]", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: dur(T.logoIn), ease: "power2.out" }, T.logoIn[0]);
            tl.fromTo(
              "[data-reveal-title] .w",
              { y: 0, yPercent: 110, opacity: 0 },
              { y: 0, yPercent: 0, opacity: 1, duration: dur(T.titleIn) * 0.7, stagger: { amount: dur(T.titleIn) * 0.3 }, ease: "power3.out" },
              T.titleIn[0],
            );
            tl.fromTo("[data-reveal-sub]", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: dur(T.subIn), ease: "power2.out" }, T.subIn[0]);
            tl.fromTo("[data-reveal-cta]", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: dur(T.ctaIn), ease: "power2.out" }, T.ctaIn[0]);
            tl.to(["[data-progress]", "[data-skip]"], { autoAlpha: 0, duration: dur(T.uiOut) }, T.uiOut[0]);
          }));
        if (!ok) return;

        ctx.add(() => {
          // todos os tweens são fromTo explícitos: não é preciso invalidar valores a cada refresh
          const st = ScrollTrigger.create({
            animation: tl,
            trigger: section,
            start: "top top",
            end: "bottom bottom",
            scrub: lite ? 0.7 : 1,
          });
          const scrollToProgress = (target: number, behavior: ScrollBehavior) => {
            window.scrollTo({ top: st.start + (st.end - st.start) * target, behavior });
          };

          const onProgressClick = (e: Event) => {
            const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-goto]");
            if (!btn) return;
            scrollToProgress(SCENE_TARGETS[Number(btn.dataset.goto)] ?? 0, "smooth");
          };
          const nav = stage.querySelector("[data-progress]");
          nav?.addEventListener("click", onProgressClick);
          cleanups.push(() => nav?.removeEventListener("click", onProgressClick));

          const skip = stage.querySelector<HTMLAnchorElement>("[data-skip]");
          const onSkip = (e: Event) => {
            e.preventDefault();
            scrollToProgress(1, "instant");
            titleRef.current?.focus({ preventScroll: true });
          };
          skip?.addEventListener("click", onSkip);
          cleanups.push(() => skip?.removeEventListener("click", onSkip));
        });
        html.dataset.introReady = "true";
      })();
    }

    return () => {
      disposed = true;
      if (pendingDraw) cancelAnimationFrame(pendingDraw);
      cleanups.forEach((fn) => fn());
      renderer?.dispose();
      renderer = null;
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="inicio"
      className="intro"
      aria-labelledby="intro-title"
      data-tone="dark"
      data-webgl="loading"
    >
      <div ref={stageRef} className="intro-stage" data-tone="dark">
        <div className="intro-bg" aria-hidden="true">
          <div className="intro-bg-warm" data-bg-warm />
          <div className="intro-bg-day" data-bg-day />
          <div className="intro-fallback-globe" data-fallback-globe />
        </div>
        <canvas ref={canvasRef} className="intro-canvas" aria-hidden="true" />
        <div className="intro-scrim" data-scrim aria-hidden="true" />
        <div className="intro-scrim-bottom" data-scrim-bottom aria-hidden="true" />

        <div ref={markerRef} className="intro-marker" aria-hidden="true">
          <span className="intro-marker-dot" />
          <span className="intro-marker-label">
            <strong>
              {site.location.city} — {site.location.region}
            </strong>
            <span>Onde a ESF está</span>
          </span>
        </div>

        <ul className="intro-symbols" aria-label="O que surge da passagem">
          {introSymbols.map((label, i) => (
            <li key={label} data-symbol={i}>
              {label}
            </li>
          ))}
        </ul>

        <div className="intro-frame">
          <div className="intro-phrases">
            {phraseScenes.map((scene, i) => (
              <Phrase key={scene.id} index={i} lines={scene.lines} />
            ))}
          </div>

          <div className="intro-reveal">
            <div ref={logoRef} className="intro-reveal-logo" data-reveal-logo>
              <LogoMark className="h-full w-full" title="ESF — Empreendendo Sem Fronteiras" />
            </div>
            <h1 ref={titleRef} id="intro-title" className="intro-title" data-reveal-title tabIndex={-1}>
              <span className="ln">
                <span className="w">Empreendendo</span>
              </span>
              <span className="ln">
                <span className="w em">sem</span> <span className="w">fronteiras</span>
              </span>
            </h1>
            <p className="intro-sub" data-reveal-sub>
              {site.tagline}
            </p>
            <div className="intro-ctas">
              <a href="#quem-somos" className="btn btn-primary" data-reveal-cta>
                Conheça nossa missão
                <span className="btn-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </div>
          </div>

          <div className="intro-cue" data-cue aria-hidden="true">
            <span>Role para descobrir</span>
            <span className="intro-cue-line" />
          </div>

          <nav className="intro-progress" data-progress aria-label="Cenas da abertura">
            <div className="intro-progress-track" aria-hidden="true">
              <span data-progress-fill />
            </div>
            <ol>
              {introScenes.map((scene, i) => (
                <li key={scene.id} data-progress-item data-active={i === 0 ? "" : undefined}>
                  <button type="button" data-goto={i}>
                    <span className="num">0{i + 1}</span>
                    <span className="lbl">{scene.label}</span>
                    <span className="sr-only">: ir para a cena {i + 1} da abertura</span>
                  </button>
                </li>
              ))}
            </ol>
            <span className="intro-progress-mobile" data-progress-label aria-hidden="true">
              01 — {introScenes[0].label}
            </span>
          </nav>

          <a href="#quem-somos" className="intro-skip" data-skip>
            Pular introdução
          </a>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { introScenes, introSymbols, site } from "@/content/site";
import { wordsOf } from "@/lib/emphasis";
import { LogoMark } from "@/components/brand/Logo";
import { computeLayout, HEADER_LIGHT_AT, SCENE_STARTS, SCENE_TARGETS, T, type Layout, type Range } from "./globe/scene";
import type { GlobeRenderer } from "./globe/renderer";
import { yieldToMain } from "@/lib/yield";

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

/** Pares de símbolos ligados por linhas delicadas na cena 4. */
const LINKS_LANDSCAPE: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
];
const LINKS_PORTRAIT: [number, number][] = [
  [0, 1],
  [2, 3],
];

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
    let raf = 0;
    let visible = true;
    let lastP = -1;
    let lastDraw = 0;
    let firstFrame = true;
    let pendingDraw = 0;
    // O movimento ambiente (cintilar, pulsos, grão) só começa após a primeira interação.
    // Até lá, o globo é desenhado sob demanda: nenhum custo contínuo de CPU/GPU em repouso.
    let engaged = false;
    const cleanups: (() => void)[] = [];

    const symbols = Array.from(stage.querySelectorAll<HTMLElement>("[data-symbol]"));
    const linkPaths = Array.from(stage.querySelectorAll<SVGPathElement>("[data-link]"));
    const constellation = stage.querySelector<SVGSVGElement>("[data-constellation]");

    /* ---------------- layout ---------------- */

    const positionConstellation = () => {
      symbols.forEach((el, i) => {
        const [x, y] = layout.glyphs[i];
        el.style.left = `${x}px`;
        el.style.top = `${y + layout.glyphR + (layout.portrait ? 10 : 18)}px`;
      });
      if (constellation) constellation.setAttribute("viewBox", `0 0 ${layout.w} ${layout.h}`);
      const pairs = layout.portrait ? LINKS_PORTRAIT : LINKS_LANDSCAPE;
      linkPaths.forEach((path, i) => {
        const pair = pairs[i];
        if (!pair) {
          path.setAttribute("d", "");
          return;
        }
        const [a, b] = pair.map((k) => layout.glyphs[k]);
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const pad = layout.glyphR * 1.3;
        const x1 = a[0] + ux * pad;
        const y1 = a[1] + uy * pad;
        const x2 = b[0] - ux * pad;
        const y2 = b[1] - uy * pad;
        const bend = (i % 2 ? -1 : 1) * Math.min(28, len * 0.08);
        const mx = (x1 + x2) / 2 - uy * bend;
        const my = (y1 + y2) / 2 + ux * bend;
        path.setAttribute("d", `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
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
      positionConstellation();
      if (renderer) {
        renderer.resize(w, h, window.devicePixelRatio || 1);
        renderer.setLayout(layout);
      }
      lastP = -1;
      requestDraw();
    };

    /* ---------------- WebGL ---------------- */

    const setWebgl = (value: "loading" | "deferred" | "on" | "off") => {
      section.dataset.webgl = value;
    };

    const updateMarker = (info: NonNullable<ReturnType<GlobeRenderer["render"]>>) => {
      const marker = markerRef.current;
      if (!marker) return;
      const facing = Math.max(0, Math.min(1, (info.marker.facing - 0.15) / 0.25));
      const alpha = info.params.marker * facing;
      marker.style.opacity = alpha.toFixed(3);
      marker.style.visibility = alpha > 0.01 ? "visible" : "hidden";
      if (alpha > 0.01) marker.style.transform = `translate3d(${info.marker.x.toFixed(1)}px, ${info.marker.y.toFixed(1)}px, 0)`;
    };

    const draw = (time: number) => {
      if (!renderer) return;
      if (renderer.isLost) {
        setWebgl("off");
        stopLoop();
        return;
      }
      const info = renderer.render(state.p, time / 1000);
      if (info) updateMarker(info);
      if (firstFrame && info) {
        firstFrame = false;
        setWebgl("on");
      }
    };

    function drawOnce() {
      if (renderer) draw(full ? performance.now() : 0);
    }

    /** Agenda um único quadro quando o loop contínuo não está ativo. */
    function requestDraw() {
      if (raf || pendingDraw || !renderer) return;
      pendingDraw = requestAnimationFrame(() => {
        pendingDraw = 0;
        drawOnce();
      });
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const p = state.p;
      const changed = Math.abs(p - lastP) > 1e-5;
      // movimento ambiente (cintilar, pulsos) a ~30 fps quando o scroll está parado
      if (!changed && now - lastDraw < (lite ? 48 : 32)) return;
      lastP = p;
      lastDraw = now;
      draw(now);
    };

    function startLoop() {
      if (!raf && renderer && full && engaged && visible && !document.hidden) raf = requestAnimationFrame(loop);
    }

    const engageEvents = ["pointermove", "pointerdown", "wheel", "touchstart", "keydown", "scroll"] as const;
    let onEngaged: () => void = () => {};
    const engagedOnce = new Promise<void>((resolve) => (onEngaged = resolve));
    const engage = () => {
      if (engaged) return;
      engaged = true;
      engageEvents.forEach((ev) => window.removeEventListener(ev, engage));
      onEngaged();
      startLoop();
    };
    engageEvents.forEach((ev) => window.addEventListener(ev, engage, { passive: true }));
    cleanups.push(() => engageEvents.forEach((ev) => window.removeEventListener(ev, engage)));
    function stopLoop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

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
          // Sem aceleração por GPU: mostramos o globo em CSS e só iniciamos o WebGL
          // (em modo econômico) quando o visitante começa a interagir.
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
          {
            lite: lite || support === "software",
            economy: support === "software",
            onContextLost: () => {
              setWebgl("off");
              stopLoop();
            },
          },
          () => disposed,
        );
      } catch (error) {
        if (process.env.NODE_ENV !== "production") console.warn("[ESF] Falha ao iniciar o globo:", error);
        renderer = null;
      }
      if (disposed) return;
      if (!renderer) {
        setWebgl("off");
        return;
      }
      measure();
      if (full) startLoop();
      drawOnce();
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
        if (visible) startLoop();
        else stopLoop();
      },
      { rootMargin: "80px 0px" },
    );
    io.observe(section);
    cleanups.push(() => io.disconnect());

    const onVisibility = () => (document.hidden ? stopLoop() : startLoop());
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
          tl.to(el, { opacity: 0, y: -48, duration: dur(r), ease: "power1.in" }, r[0]);
        };

        const ok =
          (await step(() => {
            tl = gsap.timeline({
              paused: true,
              defaults: { ease: "none" },
              onUpdate: () => {
                const p = state.p;
                if (!raf) requestDraw();
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
            exit(phrases[0], T.s1Out);
            enter(phrases[1], T.s2In);
            exit(phrases[1], T.s2Out);
          })) &&
          (await step(() => {
            enter(phrases[2], T.s3In);
            exit(phrases[2], T.s3Out);
            enter(phrases[3], T.s4In);
            exit(phrases[3], T.s4Out);
            tl.to("[data-scrim]", { opacity: 0, duration: dur(T.s3Out) }, T.s3Out[0]);
          })) &&
          (await step(() => {
            // constelação de símbolos
            tl.fromTo("[data-link]", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: dur(T.constellation), stagger: 0.012 }, T.constellation[0]);
            tl.fromTo(
              "[data-symbol]",
              { autoAlpha: 0, x: 0, y: 12, xPercent: -50 },
              { autoAlpha: 1, x: 0, y: 0, xPercent: -50, duration: dur(T.constellation) * 0.6, stagger: dur(T.constellation) * 0.1, ease: "power2.out" },
              T.constellation[0] + 0.01,
            );
            tl.to(["[data-constellation]", "[data-symbol]"], { autoAlpha: 0, duration: dur(T.constellationOut) }, T.constellationOut[0]);
            // camadas de fundo (usadas apenas quando o WebGL não está disponível)
            tl.fromTo("[data-bg-warm]", { opacity: 0 }, { opacity: 1, duration: dur(T.warm) }, T.warm[0]);
            tl.fromTo("[data-bg-day]", { opacity: 0 }, { opacity: 1, duration: dur(T.day) }, T.day[0]);
            tl.to("[data-fallback-globe]", { opacity: 0, scale: 0.8, duration: dur(T.globeOut) }, T.globeOut[0]);
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
            tl.fromTo("[data-reveal-cta]", { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: dur(T.ctaIn), stagger: 0.01, ease: "power2.out" }, T.ctaIn[0]);
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
            scrub: lite ? 0.6 : 0.9,
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
      stopLoop();
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

        <div ref={markerRef} className="intro-marker" aria-hidden="true">
          <span className="intro-marker-dot" />
          <span className="intro-marker-label">
            <strong>{site.location.city} — {site.location.region}</strong>
            <span>{site.location.coordinates}</span>
          </span>
        </div>

        <svg className="intro-constellation" data-constellation aria-hidden="true" preserveAspectRatio="none">
          {[0, 1, 2, 3].map((i) => (
            <path key={i} data-link pathLength={1} />
          ))}
        </svg>
        <ul className="intro-symbols" aria-label="O que a ESF constrói">
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
              <LogoMark className="h-full w-full" />
            </div>
            <h1 ref={titleRef} id="intro-title" className="intro-title" data-reveal-title tabIndex={-1}>
              <span className="ln">
                <span className="w">Empreendendo</span>
              </span>
              <span className="ln">
                <span className="w em">sem</span> <span className="w">
                  fronteiras<span className="intro-title-dot">.</span>
                </span>
              </span>
            </h1>
            <p className="intro-sub" data-reveal-sub>
              {site.tagline}
            </p>
            <div className="intro-ctas">
              <a href="#quem-somos" className="btn btn-primary" data-reveal-cta>
                Conheça nossa missão
                <span className="btn-arrow" aria-hidden="true">→</span>
              </a>
              <a href="#faca-parte" className="btn btn-outline" data-reveal-cta>
                Faça parte da transformação
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

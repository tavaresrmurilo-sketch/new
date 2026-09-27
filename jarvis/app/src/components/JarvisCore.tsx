import { useEffect, useRef } from "react";
import { CoreRenderer } from "../core/renderer";
import { runtime } from "../runtime";
import { displayState, STATE_LABEL, useStore } from "../state/store";

function prefersReduced(): boolean {
  const pref = useStore.getState().settings?.appearance.motion ?? "system";
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The animated core. Subscribes to the store imperatively: no React re-render per frame. */
export function JarvisCore({ particles = 720, interactive = true }: { particles?: number; interactive?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const liveRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new CoreRenderer(canvas, {
      mic: () => runtime.mic?.level ?? 0,
      micSpectrum: (out) => runtime.mic?.getFrequencies(out) ?? false,
      speech: (out) => runtime.player?.level(out) ?? 0,
    }, particles);
    (window as unknown as { __jarvisCore?: CoreRenderer }).__jarvisCore = renderer;
    const apply = () => {
      const s = useStore.getState();
      const st = displayState(s);
      renderer.setState(st);
      renderer.intensity = s.settings?.appearance.hud_intensity ?? 0.8;
      renderer.reducedMotion = prefersReduced();
      const label = STATE_LABEL[st];
      if (labelRef.current && labelRef.current.textContent !== label) {
        labelRef.current.textContent = label;
        labelRef.current.dataset.state = st;
      }
      if (liveRef.current && liveRef.current.textContent !== `Estado: ${label}`) liveRef.current.textContent = `Estado: ${label}`;
      canvas.setAttribute("aria-label", `Núcleo do Jarvis — ${label}`);
    };
    apply();
    const unsub = useStore.subscribe(apply);
    // follow-up windows expire without any store change: re-check periodically (cheap)
    const tick = window.setInterval(apply, 500);
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe(canvas);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", apply);
    renderer.resize();
    renderer.start();
    return () => {
      unsub();
      window.clearInterval(tick);
      ro.disconnect();
      mq.removeEventListener("change", apply);
      renderer.stop();
    };
  }, [particles]);

  const onActivate = () => {
    const s = useStore.getState();
    if (s.audio.speaking) runtime.interrupt();
    else runtime.listenNow();
  };

  return (
    <div className="core">
      <canvas ref={canvasRef} className="core__canvas" role="img" aria-label="Núcleo do Jarvis" />
      {interactive && (
        <button type="button" className="core__hit" onClick={onActivate} aria-label="Falar com o Jarvis (ou interromper a fala)" title="Clique para falar · Esc interrompe" />
      )}
      <span ref={labelRef} className="core__state t-label" aria-hidden="true" />
      <span ref={liveRef} className="sr-only" aria-live="polite" />
    </div>
  );
}

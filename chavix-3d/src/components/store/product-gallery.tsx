"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface GalleryImage {
  url: string;
  thumbUrl: string;
  alt: string;
  width: number;
  height: number;
}

/** Galeria com zoom por hover (desktop), rolagem com snap (celular) e tela cheia com ampliação. */
export function ProductGallery({ images, name }: { images: GalleryImage[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const [hovering, setHovering] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return <div className="layers-ink grid aspect-square place-items-center rounded-2xl border border-line bg-sunken text-muted">Sem foto</div>;
  }

  const current = images[index];

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      {/* Imagem principal (desktop) */}
      <div className="relative hidden flex-1 lg:block">
        <button
          type="button"
          className="relative block aspect-square w-full cursor-zoom-in overflow-hidden rounded-2xl border border-line bg-sunken"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setOrigin(`${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`);
          }}
          onClick={() => setLightbox(true)}
          aria-label="Ampliar imagem"
        >
          <img
            src={current.url}
            alt={current.alt || name}
            width={current.width}
            height={current.height}
            fetchPriority="high"
            className="h-full w-full object-cover transition-transform duration-200 ease-out"
            style={{ transformOrigin: origin, transform: hovering ? "scale(2)" : "scale(1)" }}
          />
          <span className="spec absolute bottom-3 left-3 rounded-md bg-surface/90 px-2 py-1 text-muted backdrop-blur">Passe o mouse para ampliar</span>
        </button>
      </div>

      {/* Carrossel (celular) */}
      <div className="relative lg:hidden">
        <div
          ref={scroller}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {images.map((image, i) => (
            <button key={image.url} type="button" className="w-full shrink-0 snap-center px-4" onClick={() => { setIndex(i); setLightbox(true); }} aria-label={`Ampliar imagem ${i + 1}`}>
              <img
                src={image.url}
                alt={image.alt || name}
                width={image.width}
                height={image.height}
                loading={i === 0 ? "eager" : "lazy"}
                className="aspect-square w-full rounded-2xl border border-line bg-sunken object-cover"
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="absolute top-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-surface/90 text-ink shadow-card backdrop-blur"
          aria-label="Ver em tela cheia"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        {images.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
            {images.map((image, i) => (
              <span key={image.url} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-ink" : "w-1.5 bg-line-strong")} />
            ))}
          </div>
        )}
      </div>

      {/* Miniaturas */}
      {images.length > 1 && (
        <div className="hidden gap-2 lg:flex lg:w-20 lg:flex-col" role="tablist" aria-label="Fotos do produto">
          {images.map((image, i) => (
            <button
              key={image.url}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                "aspect-square w-20 overflow-hidden rounded-lg border bg-sunken transition-all",
                i === index ? "border-ink ring-1 ring-ink" : "border-line opacity-70 hover:opacity-100",
              )}
            >
              <img src={image.thumbUrl} alt={`Foto ${i + 1}`} width={80} height={80} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <Dialog.Root open={lightbox} onOpenChange={(o) => { setLightbox(o); if (!o) setZoomed(false); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="overlay fixed inset-0 z-50 bg-graphite/95" />
          <Dialog.Content className="fixed inset-0 z-50 flex flex-col focus:outline-none">
            <Dialog.Title className="sr-only">{name}</Dialog.Title>
            <Dialog.Description className="sr-only">Imagem ampliada</Dialog.Description>
            <div className="flex items-center justify-between p-3 text-white">
              <span className="spec text-graphite-muted">
                {index + 1} / {images.length}
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setZoomed((z) => !z)} className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/10" aria-label={zoomed ? "Reduzir" : "Ampliar"}>
                  {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
                </button>
                <Dialog.Close className="grid h-10 w-10 place-items-center rounded-md hover:bg-white/10" aria-label="Fechar">
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className={cn("grid min-h-full place-items-center p-4", zoomed && "w-[200%] sm:w-[160%]")}>
                <img
                  src={current.url}
                  alt={current.alt || name}
                  className={cn("max-h-[80dvh] w-auto cursor-zoom-in rounded-xl object-contain", zoomed && "max-h-none w-full cursor-zoom-out")}
                  onClick={() => setZoomed((z) => !z)}
                />
              </div>
            </div>
            {images.length > 1 && (
              <div className="flex justify-center gap-2 p-4">
                {images.map((image, i) => (
                  <button
                    key={image.url}
                    type="button"
                    onClick={() => { setIndex(i); setZoomed(false); }}
                    className={cn("h-14 w-14 overflow-hidden rounded-md border-2", i === index ? "border-white" : "border-transparent opacity-60")}
                    aria-label={`Foto ${i + 1}`}
                  >
                    <img src={image.thumbUrl} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

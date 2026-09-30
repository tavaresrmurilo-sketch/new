"use client";

import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteProductImage, updateImage } from "@/app/admin/actions/products";

interface ImageItem {
  id: string;
  thumbUrl: string;
  alt: string;
}

export function ImageManager({ productId, images }: { productId: string; images: ImageItem[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(files: FileList) {
    const list = Array.from(files);
    setUploading({ done: 0, total: list.length });
    for (const [i, file] of list.entries()) {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/admin/products/${productId}/images`, { method: "POST", body });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(`${file.name}: ${data.error ?? "falha no envio"}`);
      }
      setUploading({ done: i + 1, total: list.length });
    }
    setUploading(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((image, i) => (
          <figure key={image.id} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="relative aspect-square bg-sunken">
              <img src={image.thumbUrl} alt={image.alt} className="h-full w-full object-cover" />
              {i === 0 && <span className="spec absolute top-2 left-2 rounded bg-ink px-1.5 py-0.5 text-white">Capa</span>}
            </div>
            <figcaption className="space-y-2 p-2">
              <input
                defaultValue={image.alt}
                aria-label="Texto alternativo"
                placeholder="Descrição da imagem"
                className="h-8 w-full rounded border border-line px-2 text-xs focus:border-accent focus:outline-none"
                onBlur={(e) => {
                  if (e.target.value !== image.alt) startTransition(() => updateImage(image.id, { alt: e.target.value }));
                }}
              />
              <div className="flex justify-between">
                <div className="flex">
                  <button type="button" aria-label="Mover para a esquerda" disabled={i === 0 || pending} onClick={() => startTransition(() => updateImage(image.id, { move: "up" }))} className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-sunken disabled:opacity-30">
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Mover para a direita" disabled={i === images.length - 1 || pending} onClick={() => startTransition(() => updateImage(image.id, { move: "down" }))} className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-sunken disabled:opacity-30">
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  aria-label="Excluir imagem"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("Excluir esta imagem?")) startTransition(() => deleteProductImage(image.id));
                  }}
                  className="grid h-8 w-8 place-items-center rounded text-muted hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </figcaption>
          </figure>
        ))}
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface text-sm text-muted transition-colors hover:border-ink/40 hover:text-ink">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          {uploading ? `Enviando ${uploading.done}/${uploading.total}` : "Adicionar fotos"}
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" disabled={Boolean(uploading)} onChange={(e) => e.target.files?.length && upload(e.target.files)} />
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">JPG, PNG, WebP ou AVIF até 4 MB. As fotos são convertidas para WebP e os metadados (como localização) são removidos. A primeira é a capa.</p>
    </div>
  );
}

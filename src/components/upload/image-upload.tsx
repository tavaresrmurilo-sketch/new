"use client";

import { ImagePlus, RefreshCw, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resizeImage, uploadImage, type UploadedImage } from "./resize";

export type { UploadedImage };

const MAX_INPUT_BYTES = 25 * 1024 * 1024;

const ASPECTS = {
  "16/9": "aspect-video",
  "1/1": "aspect-square",
  "3/1": "aspect-[3/1]",
} as const;

interface ImageUploadProps {
  purpose: "event-cover" | "org-logo" | "org-cover";
  organizationId: string;
  /** URL atual (prévia). */
  value: string | null;
  onChange: (image: UploadedImage | null) => void;
  aspect?: keyof typeof ASPECTS;
  label?: string;
  hint?: string;
  /** Logo: prévia redonda e compacta. */
  round?: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Envio de imagem reutilizável (capa de evento, logo e capa da organização):
 * arrastar/soltar ou escolher, redimensiona no navegador, mostra progresso e
 * as mensagens de erro da API.
 */
export function ImageUpload({ purpose, organizationId, value, onChange, aspect = "16/9", label, hint, round, className, id, disabled }: ImageUploadProps) {
  const autoId = useId();
  const inputId = id ?? `upload-${autoId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  const busy = progress != null;
  const preview = localPreview ?? value;

  async function handleFile(file: File | undefined | null) {
    if (!file || busy || disabled) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem (JPG, PNG ou WebP).");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError("Essa imagem é grande demais. Use uma de até 25 MB.");
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLocalPreview(URL.createObjectURL(file));
    setProgress(0);
    try {
      const blob = await resizeImage(file);
      const uploaded = await uploadImage(blob, { purpose, organizationId, filename: file.name.replace(/\.[^.]+$/, "") + ".jpg" }, (f) => setProgress(f), ctrl.signal);
      onChange(uploaded);
      setLocalPreview(null);
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message || "Não foi possível enviar a imagem.");
      setLocalPreview(null);
    } finally {
      setProgress(null);
      abortRef.current = null;
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const pick = () => inputRef.current?.click();

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!busy && !disabled) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      void handleFile(e.dataTransfer.files?.[0]);
    },
  };

  const pct = progress != null ? Math.round(progress * 100) : 0;

  const overlay = busy && (
    <div className="absolute inset-0 grid place-items-center bg-black/55 text-white backdrop-blur-[1px]">
      <div className={cn("flex w-full flex-col items-center gap-2 px-6", round && "px-2")}>
        <span className="text-sm font-semibold">{pct < 100 ? `Enviando… ${pct}%` : "Processando…"}</span>
        {!round && (
          <div className="h-1.5 w-full max-w-56 overflow-hidden rounded-full bg-white/25" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso do envio">
            <div className="bg-brand-gradient h-full rounded-full transition-[width] duration-200" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        )}
      </div>
    </div>
  );

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept="image/*"
      className="sr-only"
      tabIndex={-1}
      disabled={disabled || busy}
      onChange={(e) => void handleFile(e.target.files?.[0])}
    />
  );

  const errorBox = error && (
    <p role="alert" className="flex items-start gap-2 text-[13px] font-medium text-danger">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {error}
    </p>
  );

  if (round) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {label && <span className="text-sm font-semibold">{label}</span>}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={pick}
            disabled={disabled || busy}
            {...dropHandlers}
            aria-label={preview ? "Trocar logo" : "Enviar logo"}
            className={cn(
              "relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-3xl border-2 border-dashed border-border-strong bg-surface-2 text-muted-foreground transition hover:border-primary hover:text-primary",
              dragging && "border-primary bg-primary-soft text-primary",
              preview && "border-solid border-border",
            )}
          >
            {preview ? <img src={preview} alt="" className="absolute inset-0 size-full object-cover" /> : <ImagePlus className="size-7" />}
            {overlay}
          </button>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={pick} disabled={disabled || busy}>
                {preview ? <RefreshCw /> : <Upload />} {preview ? "Trocar" : "Enviar logo"}
              </Button>
              {value && !busy && (
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)} disabled={disabled}>
                  <Trash2 /> Remover
                </Button>
              )}
            </div>
            {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {input}
        {errorBox}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <span className="text-sm font-semibold">{label}</span>}
      <div
        {...dropHandlers}
        className={cn(
          "relative w-full overflow-hidden rounded-3xl border-2 border-dashed border-border-strong bg-surface-2 transition",
          ASPECTS[aspect],
          !preview && "min-h-40",
          dragging && "border-primary bg-primary-soft",
          preview && "border-solid border-border",
        )}
      >
        {preview ? (
          <>
            <img src={preview} alt="Prévia da imagem" className="absolute inset-0 size-full object-cover" />
            {!busy && (
              <div className="absolute right-3 bottom-3 flex gap-2">
                <Button type="button" size="sm" variant="glass" onClick={pick} disabled={disabled}>
                  <RefreshCw /> Trocar
                </Button>
                <Button type="button" size="icon-sm" variant="glass" onClick={() => onChange(null)} disabled={disabled} aria-label="Remover imagem">
                  <Trash2 />
                </Button>
              </div>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={pick}
            disabled={disabled || busy}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground transition hover:text-foreground"
          >
            <span className="grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
              <ImagePlus className="size-7" />
            </span>
            <span className="text-[15px] font-semibold text-foreground">
              <span className="text-primary sm:hidden">Escolher imagem</span>
              <span className="hidden sm:inline">
                Arraste uma imagem ou <span className="text-primary">escolha um arquivo</span>
              </span>
            </span>
            {hint && <span className="max-w-xs text-[13px]">{hint}</span>}
          </button>
        )}
        {overlay}
      </div>
      {input}
      {errorBox}
    </div>
  );
}

import "server-only";
import sharp, { type Metadata } from "sharp";

export type ImagePurpose = "event-cover" | "org-logo" | "org-cover" | "avatar";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif", "heif", "gif"]);

interface Variant {
  width: number;
  height: number;
  fit: "inside" | "cover";
}

const VARIANTS: Record<ImagePurpose, { full: Variant; thumb: Variant }> = {
  "event-cover": { full: { width: 1600, height: 1600, fit: "inside" }, thumb: { width: 720, height: 720, fit: "inside" } },
  "org-cover": { full: { width: 1920, height: 1080, fit: "inside" }, thumb: { width: 800, height: 800, fit: "inside" } },
  "org-logo": { full: { width: 512, height: 512, fit: "cover" }, thumb: { width: 160, height: 160, fit: "cover" } },
  avatar: { full: { width: 384, height: 384, fit: "cover" }, thumb: { width: 128, height: 128, fit: "cover" } },
};

export class ImageError extends Error {}

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  dominantColor: string;
}

/**
 * Valida pelo conteúdo (não pela extensão), corrige a orientação, remove EXIF/GPS
 * e gera duas variantes WebP.
 */
export async function processImage(input: Buffer, purpose: ImagePurpose): Promise<ProcessedImage> {
  if (input.length === 0) throw new ImageError("Arquivo vazio.");
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError("A imagem pode ter no máximo 8 MB.");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new ImageError("Não foi possível ler a imagem. Use JPG, PNG, WebP ou HEIC.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new ImageError("Formato não suportado. Use JPG, PNG, WebP ou HEIC.");
  if ((meta.width ?? 0) < 200 || (meta.height ?? 0) < 200) throw new ImageError("A imagem é muito pequena (mínimo 200 × 200 px).");

  const v = VARIANTS[purpose];
  const base = () => sharp(input, { limitInputPixels: 50_000_000, animated: false }).rotate();

  const full = await base()
    .resize({ width: v.full.width, height: v.full.height, fit: v.full.fit, withoutEnlargement: true, position: "attention" })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base()
    .resize({ width: v.thumb.width, height: v.thumb.height, fit: v.thumb.fit, withoutEnlargement: true, position: "attention" })
    .webp({ quality: 76, effort: 4 })
    .toBuffer();

  const { dominant } = await sharp(thumb).stats();
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return {
    full: full.data,
    thumb,
    width: full.info.width,
    height: full.info.height,
    dominantColor: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`,
  };
}

import "server-only";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // abaixo do limite de 4,5 MB da Vercel
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export class UploadError extends Error {}

/** Identifica o formato real pelos "magic bytes" — nunca confia na extensão ou no Content-Type. */
export function detectImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.toString("ascii", 4, 8) === "ftyp" && /^avi[fs]/.test(buffer.toString("ascii", 8, 12))) return "image/avif";
  return null;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: "image/webp";
}

/**
 * Valida e re-codifica a imagem em WebP. A re-codificação descarta metadados (EXIF/GPS)
 * e qualquer conteúdo que não seja pixel — um arquivo malicioso disfarçado não sobrevive.
 */
export async function processImage(input: Buffer, maxSide: number, quality = 82): Promise<ProcessedImage> {
  if (input.length === 0) throw new UploadError("Arquivo vazio");
  if (input.length > MAX_UPLOAD_BYTES) throw new UploadError("Imagem maior que 4 MB");
  if (!detectImageType(input)) throw new UploadError("Envie uma imagem JPG, PNG, WebP ou AVIF");

  try {
    const { data, info } = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, contentType: "image/webp" };
  } catch {
    throw new UploadError("Não conseguimos ler esta imagem. Tente outro arquivo.");
  }
}

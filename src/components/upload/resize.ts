/** Redimensiona no navegador antes do envio (economiza dados móveis e tempo de upload). */

export const MAX_SIDE = 2400;
export const JPEG_QUALITY = 0.9;

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Alguns formatos (ex.: HEIC em navegadores sem suporte) caem no <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * Lado maior ≤ 2400 px, JPEG 0,9. Se o navegador não conseguir decodificar,
 * devolve o arquivo original (o servidor valida e converte de qualquer forma).
 */
export async function resizeImage(file: File, maxSide = MAX_SIDE, quality = JPEG_QUALITY): Promise<Blob> {
  let decoded: Awaited<ReturnType<typeof decode>>;
  try {
    decoded = await decode(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
    const w = Math.max(1, Math.round(decoded.width * scale));
    const h = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Fundo branco: PNGs transparentes não ficam pretos ao virar JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    return blob ?? file;
  } finally {
    decoded.close?.();
  }
}

export interface UploadedImage {
  id: string;
  url: string;
  thumbUrl: string | null;
  width: number;
  height: number;
  dominantColor: string | null;
}

/** POST multipart para /api/uploads com progresso (XHR — fetch ainda não informa progresso de envio). */
export function uploadImage(
  blob: Blob,
  fields: { purpose: string; organizationId?: string; filename?: string },
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", blob, fields.filename ?? "imagem.jpg");
    fd.append("purpose", fields.purpose);
    if (fields.organizationId) fd.append("organizationId", fields.organizationId);
    xhr.open("POST", "/api/uploads");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as Partial<UploadedImage> & { error?: string };
      if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve(body as UploadedImage);
      else reject(new Error(body.error || (xhr.status === 413 ? "A imagem é grande demais (máx. 8 MB)." : "Não foi possível enviar a imagem.")));
    };
    xhr.onerror = () => reject(new Error("Sem conexão. Verifique a internet e tente de novo."));
    xhr.onabort = () => reject(new DOMException("Envio cancelado", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(fd);
  });
}

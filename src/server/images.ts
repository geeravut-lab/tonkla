import "server-only";

export type ImageKind = "png" | "jpeg" | "webp";
export const MAX_IMAGE_BYTES = 1024 * 1024;

/** Detect the real format from the bytes (never trust the file name or declared type). SVG/HTML are never accepted. */
export function sniffImage(b: Uint8Array): ImageKind | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

export function pngSize(b: Uint8Array): { w: number; h: number } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

export const MIME: Record<ImageKind, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

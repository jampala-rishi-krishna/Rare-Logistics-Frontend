// Client-side image handling for delivery photos. Server limit is 5 MB (jpeg/png/webp).

export const MAX_PHOTO_SIDE = 1600;
export const PHOTO_QUALITY = 0.7;

// Scale (w,h) down so the longest side is at most `max`; never upscales.
export function scaledSize(width: number, height: number, max: number = MAX_PHOTO_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= max) return { width: Math.round(width), height: Math.round(height) };
  const ratio = max / longest;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

export function jpegFilename(original: string | null | undefined, fallback = "photo"): string {
  const base = (original || fallback).replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_") || fallback;
  return `${base}.jpg`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

// Downscales a camera photo to max 1600 px as JPEG q0.7. Falls back to the original file when
// the browser cannot decode it (the server still accepts jpeg/png/webp up to 5 MB).
export async function downscaleImage(file: File): Promise<{ blob: Blob; filename: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await canvasToBlob(canvas, "image/jpeg", PHOTO_QUALITY);
    if (!blob) throw new Error("encode failed");
    return { blob, filename: jpegFilename(file.name) };
  } catch {
    return { blob: file, filename: file.name || "photo.jpg" };
  }
}

export async function canvasToPng(canvas: HTMLCanvasElement): Promise<{ blob: Blob; filename: string } | null> {
  const blob = await canvasToBlob(canvas, "image/png");
  return blob ? { blob, filename: "signature.png" } : null;
}

// Parts of a photo caption in Asia/Manila: day of month, month index (0-11) and "HH:MM". Null when unparseable.
export function manilaParts(iso: string | null | undefined): { day: number; month: number; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = String(Number(get("hour")) % 24).padStart(2, "0");
  return { day: Number(get("day")), month: Number(get("month")) - 1, time: `${hour}:${get("minute")}` };
}

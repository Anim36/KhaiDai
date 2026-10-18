"use client";

/**
 * Client-side image compression + size guards.
 *
 * Why this exists
 * ───────────────
 * Vercel's serverless request body is capped at **4.5 MB** per
 * invocation. Many of our forms (`POST /api/partner/restaurants`,
 * `POST /api/partner/menu`, `POST /api/partner/settings`,
 * `POST /api/auth/register/partner`,
 * `POST /api/auth/register/rider`, etc.) accept a base64 image
 * inside the JSON body, so a single 6 MB cover photo pushes the
 * envelope over the cap and Vercel returns `413 Payload Too Large`
 * *before* the route handler ever runs.
 *
 * The fix is to **shrink images in the browser** before they ever
 * hit the network:
 *   • re-draw the bitmap through an offscreen `<canvas>`
 *   • cap the longest edge at `MAX_LONG_EDGE_PX` (1600 px — big
 *     enough for a 2x retina menu card, small enough to stay well
 *     under the Vercel body cap once base64'd)
 *   • re-encode as JPEG at `JPEG_QUALITY` (0.82) — a 6 MB phone
 *     photo typically drops to ~250–400 KB after this
 *
 * The helpers are intentionally framework-agnostic — no React, no
 * Next — so they can be reused inside any client component or
 * effect without pulling in extra deps.
 */

export const MAX_LONG_EDGE_PX = 1600;
export const JPEG_QUALITY = 0.82;

/**
 * Cap for **non-image** files (PDFs, vehicle-registration scans,
 * NID scans, etc.). Vercel's body cap is 4.5 MB; we leave a safety
 * margin for the JSON envelope around the base64 payload.
 */
export const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB

/**
 * Soft cap for **images** before compression. Anything larger than
 * this is still attempted (the compressor will re-encode down to
 * well below), but the form should warn the user that we're
 * processing a heavy file.
 */
export const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Run an image `File` through the canvas compressor and return a
 * `data:image/jpeg;base64,…` URL. Throws a user-friendly `Error`
 * if the file isn't an image, is too large, or can't be decoded.
 */
export async function prepareImageForUpload(file: File): Promise<string> {
  if (!file || file.size === 0) {
    throw new Error("File is empty. Please pick another file.");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new Error(
      `Image is too large (${formatBytes(file.size)}). Max ${formatBytes(MAX_IMAGE_INPUT_BYTES)} before compression.`,
    );
  }
  return await compressImageFile(file);
}

/**
 * Validate a non-image file (PDF, scan, etc.) against the
 * Vercel-body cap. Returns the original `File` on success so the
 * caller can continue with whatever it was doing (typically
 * `FileReader.readAsDataURL`).
 */
export function assertNonImageUnderCap(file: File): File {
  if (!file || file.size === 0) {
    throw new Error("File is empty. Please pick another file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File is too large (${formatBytes(file.size)}). Max ${formatBytes(MAX_FILE_BYTES)} for non-image files.`,
    );
  }
  return file;
}

/**
 * Force every image through the canvas compressor. Returns a
 * `data:image/jpeg;base64,…` URL regardless of the input format
 * (PNG, WebP, HEIC on Safari, etc.).
 *
 * The function is safe to call on already-small images — the
 * browser will simply re-encode them at the same dimensions.
 */
export async function compressImageFile(file: File): Promise<string> {
  const bitmap = await fileToBitmap(file);
  try {
    return bitmapToJpegDataUrl(bitmap, MAX_LONG_EDGE_PX, JPEG_QUALITY);
  } finally {
    bitmap.close?.();
  }
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

async function fileToBitmap(file: File): Promise<ImageBitmap> {
  // `createImageBitmap` is the modern, off-main-thread-friendly
  // decoder. It's supported in every browser Next 14 targets.
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  // Fallback for the few browsers without `createImageBitmap`:
  // decode via <img> + <canvas>. Still client-side, still cheap.
  const url = URL.createObjectURL(file);
  try {
    const img = await loadHtmlImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not allocate canvas context.");
    ctx.drawImage(img, 0, 0);
    // Re-derive an ImageBitmap so the rest of the pipeline is
    // uniform across the two paths.
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not decode the selected image."));
    img.src = src;
  });
}

function bitmapToJpegDataUrl(
  bitmap: ImageBitmap,
  maxLongEdge: number,
  quality: number,
): string {
  const { width, height } = scaleToFit(bitmap.width, bitmap.height, maxLongEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not allocate canvas context.");
  // White background — without it, transparent PNGs turn black
  // after JPEG re-encode.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function scaleToFit(
  width: number,
  height: number,
  maxLongEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) return { width, height };
  const ratio = maxLongEdge / longEdge;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

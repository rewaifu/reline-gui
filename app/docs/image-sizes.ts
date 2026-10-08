// Intrinsic dimensions of static docs images (parsed from WebP headers).
// Used to reserve layout space before an image finishes loading.
export const DOCS_IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  "/docs/main-web-en.webp": { width: 1920, height: 1016 },
  "/docs/main-web-ru.webp": { width: 1920, height: 1016 },
  "/docs/main-tauri-en.webp": { width: 1919, height: 1079 },
  "/docs/main-tauri-ru.webp": { width: 1919, height: 1079 },
  "/docs/low-dot.webp": { width: 1500, height: 500 },
  "/docs/saw.webp": { width: 630, height: 200 },
  "/docs/sharp.webp": { width: 908, height: 255 },
  "/docs/nasral.webp": { width: 769, height: 238 },
  "/docs/screentone.webp": { width: 720, height: 104 },
  "/docs/good.webp": { width: 146, height: 146 },
  "/docs/bad.webp": { width: 102, height: 92 },
  "/docs/with-artifacts.webp": { width: 156, height: 155 },
  "/docs/comparison/canny/raw.webp": { width: 227, height: 255 },
  "/docs/comparison/canny/unsharp.webp": { width: 227, height: 255 },
  "/docs/comparison/canny/normal.webp": { width: 227, height: 255 },
  "/docs/comparison/canny/invert.webp": { width: 227, height: 255 },
}

export function getDocsImageSize(src: string): { width: number; height: number } | undefined {
  return DOCS_IMAGE_SIZES[src]
}

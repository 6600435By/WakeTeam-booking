/** Максимальный размер загружаемого фото для виджета */
export const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024; // 2 MB

export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

const MIME_EXT: Record<AllowedImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForMime(mime: string): string | null {
  if (ALLOWED_IMAGE_MIME.includes(mime as AllowedImageMime)) {
    return MIME_EXT[mime as AllowedImageMime];
  }
  return null;
}

export function validateImageUpload(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME.includes(file.type as AllowedImageMime)) {
    return "Допустимы только JPEG, PNG или WebP";
  }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return `Файл слишком большой (макс. ${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)} МБ)`;
  }
  if (file.size === 0) {
    return "Пустой файл";
  }
  return null;
}

export function formatMaxUploadSize(): string {
  return `${MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)} МБ`;
}

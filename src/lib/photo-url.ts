/** Paths from local dev fallback (`public/uploads/`) — not available on Vercel. */
export function isLocalUploadPhotoUrl(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith("/uploads/"));
}

/**
 * Hides dev-only file paths in production API responses.
 * Neon may contain `/uploads/...` saved during local development.
 */
export function sanitizePhotoUrlForClient(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (
    isLocalUploadPhotoUrl(url) &&
    (process.env.VERCEL || process.env.NODE_ENV === "production")
  ) {
    return null;
  }
  return url;
}

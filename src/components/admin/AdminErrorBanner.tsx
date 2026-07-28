"use client";

import { formatAdminError, parseAdminErrorParts } from "@/lib/admin/admin-api-error";

/** Compact error block: title + actionable hint. */
export function AdminErrorBanner({
  error,
  hint,
  title = "Не удалось выполнить действие",
  className = "",
}: {
  error: string;
  hint?: string;
  title?: string;
  className?: string;
}) {
  if (!error) return null;
  return (
    <div
      className={`rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 ${className}`}
      role="alert"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-0.5">{error}</p>
      {hint ? (
        <p className="mt-1 text-red-600/80">Что сделать: {hint}</p>
      ) : null}
    </div>
  );
}

/** Parse API JSON (or Error message already formatted) into banner props. */
export function adminErrorFromUnknown(
  err: unknown,
  fallback = "Не удалось выполнить действие",
): { error: string; hint?: string } {
  if (err && typeof err === "object" && "error" in err) {
    return parseAdminErrorParts(err);
  }
  if (err instanceof Error && err.message) {
    const parts = err.message.split(". ");
    if (parts.length > 1) {
      return { error: parts[0], hint: parts.slice(1).join(". ") };
    }
    return { error: err.message };
  }
  return { error: formatAdminError(err, fallback) };
}

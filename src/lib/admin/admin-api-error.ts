import { NextResponse } from "next/server";
import { z } from "zod";
import { handleAdminError } from "@/lib/admin-access";
import {
  zodToAdminError,
  type AdminApiErrorBody,
  type AdminHandledError,
} from "@/lib/admin/format-admin-error";

export type { AdminApiErrorBody, AdminHandledError };
export {
  ADMIN_FIELD_LABELS,
  formatAdminError,
  humanizeZodIssue,
  parseAdminErrorParts,
  zodToAdminError,
} from "@/lib/admin/format-admin-error";

const DEFAULT_SERVER_HINT =
  "Обновите страницу и повторите действие. Если ошибка повторяется — перелогиньтесь или обратитесь к администратору.";

export function jsonAdminError(
  error: string,
  status: number,
  hint?: string,
): NextResponse {
  const body: AdminApiErrorBody = hint ? { error, hint } : { error };
  return NextResponse.json(body, { status });
}

/**
 * Map unknown catch values to a NextResponse.
 * Pass domainMapper for route-specific Error codes (returns null if unknown).
 * Server-only — do not import from Client Components.
 */
export function adminCatchResponse(
  e: unknown,
  fallbackHint: string = DEFAULT_SERVER_HINT,
  domainMapper?: (e: unknown) => AdminHandledError | null,
): NextResponse {
  if (domainMapper) {
    const mapped = domainMapper(e);
    if (mapped) {
      return jsonAdminError(mapped.error, mapped.status, mapped.hint);
    }
  }

  if (e instanceof z.ZodError) {
    const mapped = zodToAdminError(e);
    return jsonAdminError(mapped.error, mapped.status, mapped.hint);
  }

  const access = handleAdminError(e);
  if (access) {
    return jsonAdminError(access.error, access.status, access.hint);
  }

  console.error(e);
  return jsonAdminError("Не удалось выполнить действие", 500, fallbackHint);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { handleAdminError } from "@/lib/admin-access";

export type AdminApiErrorBody = {
  error: string;
  hint?: string;
};

export type AdminHandledError = {
  status: number;
  error: string;
  hint?: string;
};

const DEFAULT_SERVER_HINT =
  "Обновите страницу и повторите действие. Если ошибка повторяется — перелогиньтесь или обратитесь к администратору.";

/** Shared field labels for Zod → human messages across admin APIs. */
export const ADMIN_FIELD_LABELS: Record<string, string> = {
  phone: "Телефон",
  firstName: "Имя",
  lastName: "Фамилия",
  email: "Email",
  serviceId: "Услуга",
  staffId: "Реверс",
  startAt: "Время начала",
  durationMinutes: "Длительность",
  status: "Статус",
  comment: "Комментарий",
  membershipId: "Абонемент",
  paymentMethod: "Способ оплаты",
  cashAmount: "Наличные",
  cardAmount: "Карта",
  price: "Цена",
  rentalItemId: "Прокат",
  rentalQuantity: "Кол-во проката",
  operatorMemberId: "Оператор",
  branchId: "Филиал",
  name: "Название",
  date: "Дата",
  memberId: "Сотрудник",
};

export function humanizeZodIssue(field: string, message: string): string {
  const label = ADMIN_FIELD_LABELS[field] ?? field;
  if (/required|обязатель/i.test(message) || message === "Required") {
    return `${label}: обязательное поле`;
  }
  if (/String must contain at least|too_small|min/i.test(message)) {
    if (field === "phone") return "Укажите корректный телефон (не менее 6 символов)";
    if (field === "firstName") return "Укажите имя клиента";
    return `${label}: значение слишком короткое`;
  }
  if (/invalid|Invalid/i.test(message)) {
    return `${label}: некорректное значение`;
  }
  return `${label}: ${message}`;
}

export function zodToAdminError(e: z.ZodError): AdminHandledError {
  const flat = e.flatten();
  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
  const parts: string[] = [];
  for (const [key, msgs] of Object.entries(fieldErrors)) {
    const msg = Array.isArray(msgs) ? msgs[0] : undefined;
    if (msg) parts.push(humanizeZodIssue(key, msg));
  }
  for (const msg of flat.formErrors ?? []) {
    if (msg) parts.push(msg);
  }
  return {
    status: 400,
    error: parts[0] ?? "Проверьте заполнение полей",
    hint:
      parts.length > 1
        ? parts.slice(1).join(". ")
        : "Исправьте отмеченные поля и сохраните снова.",
  };
}

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

/** Build a single user-facing message from API `{ error, hint? }`. */
export function formatAdminError(
  data: unknown,
  fallback = "Не удалось выполнить действие",
): string {
  if (!data || typeof data !== "object") return fallback;
  const payload = data as { error?: unknown; hint?: unknown };

  let message = "";
  if (typeof payload.error === "string") {
    message = payload.error;
  } else if (payload.error && typeof payload.error === "object") {
    const flat = payload.error as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[] | undefined>;
    };
    const fieldErrors = (flat.fieldErrors ?? {}) as Record<
      string,
      string[] | undefined
    >;
    const parts: string[] = [];
    for (const [key, msgs] of Object.entries(fieldErrors)) {
      const msg = Array.isArray(msgs) ? msgs[0] : undefined;
      if (msg) parts.push(humanizeZodIssue(key, msg));
    }
    for (const msg of flat.formErrors ?? []) {
      if (msg) parts.push(msg);
    }
    message = parts[0] ?? "Проверьте заполнение полей";
    if (parts.length > 1) {
      return `${message}. ${parts.slice(1).join(". ")}`;
    }
  }

  if (!message) return fallback;
  if (typeof payload.hint === "string" && payload.hint.trim()) {
    return `${message}. ${payload.hint.trim()}`;
  }
  return message;
}

export function parseAdminErrorParts(data: unknown): {
  error: string;
  hint?: string;
} {
  if (!data || typeof data !== "object") {
    return { error: "Не удалось выполнить действие" };
  }
  const payload = data as { error?: unknown; hint?: unknown };
  const error =
    typeof payload.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : "Не удалось выполнить действие";
  const hint =
    typeof payload.hint === "string" && payload.hint.trim()
      ? payload.hint.trim()
      : undefined;
  return hint ? { error, hint } : { error };
}

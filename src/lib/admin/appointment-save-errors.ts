import { z } from "zod";
import {
  formatAdminError,
  humanizeZodIssue,
  zodToAdminError,
  type AdminApiErrorBody,
} from "@/lib/admin/format-admin-error";

/** User-facing messages for appointment create/update failures in the journal. */

const BOOKING_CODE_MESSAGES: Record<
  string,
  { error: string; status: number; hint?: string }
> = {
  SLOT_UNAVAILABLE: {
    error: "Слот занят",
    status: 409,
    hint: "Выберите другое время или другой реверс.",
  },
  MEMBERSHIP_INSUFFICIENT_MINUTES: {
    error: "Недостаточно минут на абонементе",
    status: 409,
    hint: "Разделите запись, уменьшите длительность сегмента, выберите другой абонемент или оплатите остаток наличными/картой.",
  },
  MEMBERSHIP_ROLLBACK_FAILED: {
    error: "Не удалось откатить списание абонемента",
    status: 409,
    hint: "Обновите страницу и повторите изменение статуса.",
  },
  STAFF_REQUIRED: {
    error: "Не выбран реверс",
    status: 400,
    hint: "Укажите реверс (ресурс) для записи.",
  },
  SERVICE_NOT_BOOKABLE: {
    error: "Услуга недоступна для записи",
    status: 400,
    hint: "Проверьте, что услуга активна и доступна онлайн/в журнале.",
  },
  SERVICE_ORG_MISMATCH: {
    error: "Услуга недоступна для записи",
    status: 400,
    hint: "Услуга относится к другой организации. Выберите услугу текущего филиала.",
  },
  INVALID_SLOT: {
    error: "Некорректное время записи",
    status: 400,
    hint: "Выберите время в рабочих часах филиала.",
  },
  INVALID_DURATION: {
    error: "Некорректная длительность",
    status: 400,
    hint: "Укажите длительность, допустимую для выбранной услуги.",
  },
  INVALID_QUANTITY: {
    error: "Некорректное количество",
    status: 400,
    hint: "Укажите количество от 1 и не больше свободных мест.",
  },
  PAYMENT_AMOUNTS_MISMATCH: {
    error: "Сумма наличных и карты не равна сумме к оплате",
    status: 400,
    hint: "Исправьте поля «Наличные» и «Карта», чтобы их сумма совпала с суммой к оплате.",
  },
  SPLIT_TOO_SHORT: {
    error: "Слишком короткая запись для разделения",
    status: 400,
    hint: "Нужно минимум 2 минуты. Увеличьте длительность или выберите другую запись.",
  },
  SPLIT_SLOT_UNAVAILABLE: {
    error: "Не удалось разделить запись",
    status: 409,
    hint: "Второй сегмент пересекается с другой записью. Освободите слот или измените время.",
  },
};

export type AppointmentSaveErrorBody = AdminApiErrorBody;

/** Map thrown booking codes / Zod errors to a JSON body for admin appointment routes. */
export function appointmentSaveErrorResponse(
  e: unknown,
): { body: AppointmentSaveErrorBody; status: number } | null {
  if (e instanceof Error) {
    const mapped = BOOKING_CODE_MESSAGES[e.message];
    if (mapped) {
      let hint = mapped.hint;
      if (e.message === "PAYMENT_AMOUNTS_MISMATCH") {
        const extra = e as Error & { due?: number; sum?: number };
        if (typeof extra.due === "number" && typeof extra.sum === "number") {
          hint = `К оплате ${extra.due.toFixed(2)}, сейчас ${extra.sum.toFixed(2)}. Исправьте наличные и карту.`;
        }
      }
      return {
        body: {
          error: mapped.error,
          ...(hint ? { hint } : {}),
        },
        status: mapped.status,
      };
    }
  }

  if (e instanceof z.ZodError) {
    const mapped = zodToAdminError(e);
    return { body: { error: mapped.error, hint: mapped.hint }, status: mapped.status };
  }

  return null;
}

/** @deprecated prefer formatAdminError — kept for existing imports */
export function formatAppointmentSaveError(
  data: unknown,
  fallback = "Ошибка сохранения",
): string {
  return formatAdminError(data, fallback);
}

export { humanizeZodIssue };

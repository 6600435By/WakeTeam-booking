import { z } from "zod";

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
    hint: "Выберите другой абонемент или способ оплаты.",
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
};

const FIELD_LABELS: Record<string, string> = {
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
  price: "Цена",
  rentalItemId: "Прокат",
  rentalQuantity: "Кол-во проката",
  operatorMemberId: "Оператор",
};

function humanizeZodIssue(field: string, message: string): string {
  const label = FIELD_LABELS[field] ?? field;
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

export type AppointmentSaveErrorBody = {
  error: string;
  hint?: string;
};

/** Map thrown booking codes / Zod errors to a JSON body for admin appointment routes. */
export function appointmentSaveErrorResponse(
  e: unknown,
): { body: AppointmentSaveErrorBody; status: number } | null {
  if (e instanceof Error) {
    const mapped = BOOKING_CODE_MESSAGES[e.message];
    if (mapped) {
      return {
        body: {
          error: mapped.error,
          ...(mapped.hint ? { hint: mapped.hint } : {}),
        },
        status: mapped.status,
      };
    }
  }

  if (e instanceof z.ZodError) {
    const flat = e.flatten();
    const parts: string[] = [];
    for (const [key, msgs] of Object.entries(flat.fieldErrors ?? {})) {
      const msg = msgs?.[0];
      if (msg) parts.push(humanizeZodIssue(key, msg));
    }
    for (const msg of flat.formErrors ?? []) {
      if (msg) parts.push(msg);
    }
    return {
      body: {
        error: parts[0] ?? "Проверьте заполнение полей",
        hint:
          parts.length > 1
            ? parts.slice(1).join(". ")
            : "Исправьте отмеченные поля и сохраните снова.",
      },
      status: 400,
    };
  }

  return null;
}

/** Build a single user-facing message from API `{ error, hint? }` (or legacy shapes). */
export function formatAppointmentSaveError(data: unknown, fallback = "Ошибка сохранения"): string {
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
    const parts: string[] = [];
    for (const [key, msgs] of Object.entries(flat.fieldErrors ?? {})) {
      const msg = msgs?.[0];
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

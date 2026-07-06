import type { ZodError } from "zod";

export const USER_FIELD_LABELS: Record<string, string> = {
  lastName: "Фамилия",
  login: "Логин",
  name: "Имя",
  password: "Пароль",
  branchId: "Филиал",
  branchIds: "Закреплённые филиалы",
  phone: "Телефон",
  passportNumber: "Паспорт",
  registrationAddress: "Прописка",
  role: "Роль",
  email: "Email",
};

const LABEL_TO_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(USER_FIELD_LABELS).map(([key, label]) => [label, key]),
);

function fieldMessagesFromFormattedError(error: string): Record<string, string> {
  const fieldMessages: Record<string, string> = {};
  for (const part of error.split(". ")) {
    const match = part.match(/^([^:]+):\s*(.+)$/);
    if (!match) continue;
    const field = LABEL_TO_FIELD[match[1]!.trim()];
    if (field) fieldMessages[field] = match[2]!.trim();
  }
  return fieldMessages;
}

function humanizeZodMessage(field: string, message: string): string {
  if (/at least 6/i.test(message)) return "не менее 6 символов";
  if (/at least 2/i.test(message)) return "не менее 2 символов";
  if (/at least 1/i.test(message)) return "обязательное поле";
  if (/invalid.*email/i.test(message)) return "некорректный email";
  if (/required/i.test(message)) return "обязательное поле";
  if (field === "password" && /string/i.test(message)) return "укажите пароль";
  return "заполните поле";
}

export function formatUserZodError(error: ZodError): string {
  const parts: string[] = [];
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    const label = (USER_FIELD_LABELS[field] ?? field) || "Поле";
    parts.push(`${label}: ${humanizeZodMessage(field, issue.message)}`);
  }
  if (parts.length === 0) return "Проверьте заполнение полей";
  return parts.join(". ");
}

export function fieldsFromZodError(error: ZodError): string[] {
  return [...new Set(error.issues.map((i) => String(i.path[0] ?? "")).filter(Boolean))];
}

export type UserFormInput = {
  lastName: string;
  login: string;
  name: string;
  password: string;
  role: string;
  branchId: string;
  branchIds: string[];
};

export function validateUserForm(
  form: UserFormInput,
  isCreate: boolean,
): { message: string; fieldMessages: Record<string, string> } | null {
  const fieldMessages: Record<string, string> = {};

  if (!form.lastName.trim()) {
    fieldMessages.lastName = "Укажите фамилию";
  }
  if (!form.login.trim()) {
    fieldMessages.login = "Укажите логин";
  } else if (form.login.trim().length < 2) {
    fieldMessages.login = "Не менее 2 символов";
  }
  if (!form.name.trim()) {
    fieldMessages.name = "Укажите имя";
  }
  if (isCreate && !form.password.trim()) {
    fieldMessages.password = "Укажите пароль";
  } else if (form.password.trim() && form.password.trim().length < 6) {
    fieldMessages.password = "Не менее 6 символов";
  }

  if (form.role === "branch_manager" && form.branchIds.length === 0) {
    fieldMessages.branchIds = "Выберите хотя бы один филиал";
  }
  if (
    form.role !== "super_admin" &&
    form.role !== "branch_manager" &&
    !form.branchId
  ) {
    fieldMessages.branchId = "Выберите филиал";
  }

  const fields = Object.keys(fieldMessages);
  if (fields.length === 0) return null;

  const message =
    fields.length === 1
      ? fieldMessages[fields[0]!]!
      : `Заполните: ${fields.map((f) => USER_FIELD_LABELS[f]?.toLowerCase() ?? f).join(", ")}`;

  return { message, fieldMessages };
}

export function parseUserApiError(
  data: unknown,
): { message: string; fieldMessages: Record<string, string> } {
  if (!data || typeof data !== "object") {
    return { message: "Ошибка сохранения", fieldMessages: {} };
  }
  const error = (data as { error?: unknown }).error;
  if (typeof error === "string") {
    const fromFormat = fieldMessagesFromFormattedError(error);
    if (Object.keys(fromFormat).length > 0) {
      return { message: error, fieldMessages: fromFormat };
    }
    const fieldMessages: Record<string, string> = {};
    if (/филиал/i.test(error) && /управляющ/i.test(error)) {
      fieldMessages.branchIds = error;
    } else if (/филиал/i.test(error)) {
      fieldMessages.branchId = error;
    }
    if (/парол/i.test(error)) fieldMessages.password = error;
    if (/логин/i.test(error)) fieldMessages.login = error;
    if (/фамили/i.test(error)) fieldMessages.lastName = error;
    if (/\bимя\b/i.test(error)) fieldMessages.name = error;
    return { message: error, fieldMessages };
  }
  if (error && typeof error === "object" && "fieldErrors" in error) {
    const fieldErrors = error.fieldErrors as Record<string, string[]>;
    const fieldMessages: Record<string, string> = {};
    const parts: string[] = [];
    for (const [key, msgs] of Object.entries(fieldErrors)) {
      const label = USER_FIELD_LABELS[key] ?? key;
      const text = msgs?.[0]
        ? `${label}: ${humanizeZodMessage(key, msgs[0])}`
        : `${label}: обязательное поле`;
      fieldMessages[key] = humanizeZodMessage(key, msgs?.[0] ?? "обязательное поле");
      parts.push(text);
    }
    return {
      message: parts.length ? parts.join(". ") : "Проверьте заполнение полей",
      fieldMessages,
    };
  }
  return { message: "Ошибка сохранения", fieldMessages: {} };
}

/** Только цифры из строки телефона */
export function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Минимум цифр для поиска по номеру (последние 7) */
export const MIN_PHONE_SEARCH_DIGITS = 7;

const BY_NATIONAL_LEN = 9;
/** E.164: country code + subscriber, без «+» */
const E164_MIN_DIGITS = 10;
const E164_MAX_DIGITS = 15;

/**
 * Белорусские эвристики по цифрам:
 * — ровно 9 (национальный),
 * — 80 + 9,
 * — 375 + 9+.
 */
export function isBelarusPhoneDigits(digits: string): boolean {
  if (!digits) return false;
  if (digits.length === BY_NATIONAL_LEN) return true;
  if (digits.startsWith("80") && digits.length === 11) return true;
  if (digits.startsWith("375") && digits.length >= 12) return true;
  return false;
}

/** Национальный номер BY (9 цифр) или null, если номер не белорусский */
export function belarusNationalDigits(phone: string): string | null {
  const d = phoneDigitsOnly(phone);
  if (!isBelarusPhoneDigits(d)) return null;
  if (d.length === BY_NATIONAL_LEN) return d;
  if (d.startsWith("80")) return d.slice(-BY_NATIONAL_LEN);
  if (d.startsWith("375")) return d.slice(3, 3 + BY_NATIONAL_LEN);
  return d.slice(-BY_NATIONAL_LEN);
}

/**
 * Национальный номер (9 цифр для BY), без кода страны.
 * Для не-BY возвращает последние 9 цифр (legacy); для foreign-логики лучше `belarusNationalDigits`.
 */
export function nationalPhoneDigits(phone: string): string {
  const by = belarusNationalDigits(phone);
  if (by) return by;
  const d = phoneDigitsOnly(phone);
  if (!d) return "";
  if (d.length <= BY_NATIONAL_LEN) return d;
  return d.slice(-BY_NATIONAL_LEN);
}

export function isForeignE164Digits(digits: string): boolean {
  return (
    digits.length >= E164_MIN_DIGITS &&
    digits.length <= E164_MAX_DIGITS &&
    !isBelarusPhoneDigits(digits)
  );
}

/** Полный номер для сохранения в БД (BY или международный E.164) */
export function isCompletePhone(phone: string): boolean {
  const d = phoneDigitsOnly(phone);
  if (belarusNationalDigits(phone)?.length === BY_NATIONAL_LEN) return true;
  return isForeignE164Digits(d);
}

/** Достаточно цифр для поиска (в т.ч. 7 последних) */
export function isSearchablePhone(phone: string): boolean {
  return phoneDigitsOnly(phone).length >= MIN_PHONE_SEARCH_DIGITS;
}

/**
 * Сопоставление при поиске: полный номер или совпадение по суффиксу (7–8 цифр).
 * Для BY — по национальным 9; для foreign — по полным цифрам E.164.
 */
export function phoneMatchesSearch(query: string, stored: string): boolean {
  const qDigits = phoneDigitsOnly(query);
  if (qDigits.length < MIN_PHONE_SEARCH_DIGITS) return false;

  const storedDigits = phoneDigitsOnly(stored);
  if (!storedDigits) return false;

  const qBy = belarusNationalDigits(query);
  const sBy = belarusNationalDigits(stored);

  if (qBy && sBy) {
    if (qDigits.length >= BY_NATIONAL_LEN || qBy.length >= BY_NATIONAL_LEN) {
      return qBy === sBy;
    }
    const suffix = qDigits.slice(-Math.min(qDigits.length, BY_NATIONAL_LEN));
    return sBy.endsWith(suffix);
  }

  // Foreign / mixed: exact full digits, or suffix on full stored number
  if (isCompletePhone(query)) {
    return phoneDigitsOnly(normalizePhone(query)) === phoneDigitsOnly(normalizePhone(stored));
  }

  const suffix = qDigits.slice(-Math.min(qDigits.length, E164_MAX_DIGITS));
  return storedDigits.endsWith(suffix);
}

/** Значение по умолчанию в виджете записи */
export const WIDGET_DEFAULT_PHONE = "+375";

/** Поле телефона в виджете: всегда с ведущим + */
export function sanitizeWidgetPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "+";
}

/** Подготовка номера для поля виджета */
export function toWidgetPhone(value: string): string {
  const digits = phoneDigitsOnly(value);
  if (!digits) return WIDGET_DEFAULT_PHONE;
  return `+${digits}`;
}

/**
 * Канонический формат:
 * — BY → +375XXXXXXXXX
 * — иначе E.164 → +{digits} (без принудительного 375)
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const d = phoneDigitsOnly(trimmed);
  if (!d) return trimmed;

  const by = belarusNationalDigits(trimmed);
  if (by && by.length === BY_NATIONAL_LEN) {
    return `+375${by}`;
  }

  if (isForeignE164Digits(d)) {
    return `+${d}`;
  }

  return `+${d}`;
}

/** Сравнение номеров без учёта формата записи */
export function phonesMatch(a: string, b: string): boolean {
  if (!isCompletePhone(a) || !isCompletePhone(b)) return false;

  const aBy = belarusNationalDigits(a);
  const bBy = belarusNationalDigits(b);
  if (aBy && bBy) return aBy === bBy;

  return phoneDigitsOnly(normalizePhone(a)) === phoneDigitsOnly(normalizePhone(b));
}

/** Варианты, под которыми номер мог быть сохранён в БД */
export function phoneStoredVariants(phoneRaw: string): string[] {
  if (!isCompletePhone(phoneRaw)) return [];

  const variants = new Set<string>();
  const canonical = normalizePhone(phoneRaw);
  variants.add(canonical);
  variants.add(phoneDigitsOnly(canonical));
  variants.add(phoneRaw.trim());

  const by = belarusNationalDigits(phoneRaw);
  if (by && by.length === BY_NATIONAL_LEN) {
    variants.add(`+375${by}`);
    variants.add(`375${by}`);
    variants.add(`80${by}`);
    variants.add(`+80${by}`);
    variants.add(by);
  }

  return [...variants];
}

/** Только цифры из строки телефона */
export function phoneDigitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Минимум цифр для поиска по номеру (последние 7) */
export const MIN_PHONE_SEARCH_DIGITS = 7;

/** Национальный номер (9 цифр для BY), без кода страны */
export function nationalPhoneDigits(phone: string): string {
  const d = phoneDigitsOnly(phone);
  if (!d) return "";
  if (d.length <= 9) return d;
  return d.slice(-9);
}

/** Полный номер для сохранения в БД */
export function isCompletePhone(phone: string): boolean {
  return nationalPhoneDigits(phone).length >= 9;
}

/** Достаточно цифр для поиска (в т.ч. 7 последних) */
export function isSearchablePhone(phone: string): boolean {
  return phoneDigitsOnly(phone).length >= MIN_PHONE_SEARCH_DIGITS;
}

/**
 * Сопоставление при поиске: полный номер или совпадение по суффиксу (7–8 цифр).
 */
export function phoneMatchesSearch(query: string, stored: string): boolean {
  const qDigits = phoneDigitsOnly(query);
  if (qDigits.length < MIN_PHONE_SEARCH_DIGITS) return false;

  const storedNational = nationalPhoneDigits(stored);
  if (storedNational.length < MIN_PHONE_SEARCH_DIGITS) return false;

  if (qDigits.length >= 9) {
    return storedNational === nationalPhoneDigits(query);
  }

  const suffix = qDigits.slice(-Math.min(qDigits.length, 9));
  return storedNational.endsWith(suffix);
}

/** Канонический формат +375XXXXXXXXX */
export function normalizePhone(phone: string): string {
  const national = nationalPhoneDigits(phone);
  if (national.length >= 9) {
    return `+375${national.slice(-9)}`;
  }
  const d = phoneDigitsOnly(phone);
  if (!d) return phone.trim();
  return `+${d}`;
}

/** Сравнение номеров без учёта формата записи */
export function phonesMatch(a: string, b: string): boolean {
  const na = nationalPhoneDigits(a);
  const nb = nationalPhoneDigits(b);
  if (na.length < 9 || nb.length < 9) return false;
  return na === nb;
}

/** Варианты, под которыми номер мог быть сохранён в БД */
export function phoneStoredVariants(phoneRaw: string): string[] {
  const national = nationalPhoneDigits(phoneRaw);
  if (national.length < 9) return [];

  const variants = new Set<string>();
  variants.add(normalizePhone(phoneRaw));
  variants.add(`+375${national}`);
  variants.add(`375${national}`);
  variants.add(`80${national}`);
  variants.add(`+80${national}`);
  variants.add(national);
  variants.add(phoneRaw.trim());
  return [...variants];
}

import { prisma } from "@/lib/db";
import {
  isCompletePhone,
  isSearchablePhone,
  nationalPhoneDigits,
  phoneDigitsOnly,
  phoneMatchesSearch,
  phoneStoredVariants,
  MIN_PHONE_SEARCH_DIGITS,
} from "@/lib/phone";

export async function findMembershipsByPhone(
  organizationId: string,
  phoneRaw: string,
) {
  if (!isSearchablePhone(phoneRaw)) return [];

  if (isCompletePhone(phoneRaw)) {
    const variants = phoneStoredVariants(phoneRaw);
    const byVariant = await prisma.membership.findMany({
      where: {
        organizationId,
        phone: { in: variants },
      },
      orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
    });
    if (byVariant.length > 0) return byVariant;

    const national = nationalPhoneDigits(phoneRaw);
    const memberships = await prisma.membership.findMany({
      where: { organizationId },
      orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
    });
    return memberships.filter((m) => nationalPhoneDigits(m.phone) === national);
  }

  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
  });
  return memberships.filter((m) => phoneMatchesSearch(phoneRaw, m.phone));
}

export function normalizeMembershipCode(code: string): string {
  return code.trim();
}

export async function findMembershipsByCode(
  organizationId: string,
  codeRaw: string,
) {
  const code = normalizeMembershipCode(codeRaw);
  if (!code) return [];

  const exact = await prisma.membership.findMany({
    where: {
      organizationId,
      externalCode: code,
    },
    orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
  });
  if (exact.length > 0) return exact;

  const codeLower = code.toLowerCase();
  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    orderBy: [{ saleDate: "desc" }, { syncedAt: "desc" }],
  });
  return memberships.filter(
    (m) => m.externalCode.trim().toLowerCase() === codeLower,
  );
}

/** Телефон: 7+ цифр без букв */
export function isPhoneSearchQuery(query: string): boolean {
  const t = query.trim();
  if (!t || /[a-zA-Zа-яА-ЯёЁ]/.test(t)) return false;
  return phoneDigitsOnly(t).length >= MIN_PHONE_SEARCH_DIGITS;
}

/** Код абонемента: есть буквы или короткий буквенно-цифровой номер */
export function isMembershipCodeQuery(query: string): boolean {
  const t = query.trim();
  if (!t) return false;
  if (/[a-zA-Zа-яА-ЯёЁ]/.test(t)) return true;
  return phoneDigitsOnly(t).length < MIN_PHONE_SEARCH_DIGITS;
}

export async function searchMemberships(
  organizationId: string,
  queryRaw: string,
) {
  const query = queryRaw.trim();
  if (!query) return [];

  if (isPhoneSearchQuery(query)) {
    return findMembershipsByPhone(organizationId, query);
  }
  if (isMembershipCodeQuery(query)) {
    return findMembershipsByCode(organizationId, query);
  }
  return findMembershipsByCode(organizationId, query);
}

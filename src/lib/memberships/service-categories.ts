/** Категории абонементов для вейкборда. */
export const WAKE_MEMBERSHIP_CATEGORIES = ["Подарочный", "Абонемент"] as const;

/** Категории абонементов для сапборда. */
export const SUP_MEMBERSHIP_CATEGORIES = ["САП Подарочный"] as const;

function normalizeCategory(category: string | null | undefined): string {
  return (category ?? "").trim().toLocaleLowerCase("ru-RU");
}

export function membershipCategoriesForServiceKind(
  serviceKind: string | null | undefined,
): readonly string[] {
  if (serviceKind === "sup") return SUP_MEMBERSHIP_CATEGORIES;
  return WAKE_MEMBERSHIP_CATEGORIES;
}

export function membershipMatchesServiceKind(
  category: string | null | undefined,
  serviceKind: string | null | undefined,
): boolean {
  const normalized = normalizeCategory(category);
  return membershipCategoriesForServiceKind(serviceKind).some(
    (allowed) => normalizeCategory(allowed) === normalized,
  );
}

export function filterMembershipsByServiceKind<
  T extends { category: string | null },
>(memberships: T[], serviceKind: string | null | undefined): T[] {
  return memberships.filter((m) =>
    membershipMatchesServiceKind(m.category, serviceKind),
  );
}

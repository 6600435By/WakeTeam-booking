import { prisma } from "@/lib/db";
import {
  isCompletePhone,
  isSearchablePhone,
  nationalPhoneDigits,
  normalizePhone,
  phoneMatchesSearch,
  phoneStoredVariants,
} from "@/lib/phone";

const clientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  createdAt: true,
} as const;

export type ClientLookupRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
  email: string | null;
  createdAt: Date;
};

export async function findClientByPhone(
  organizationId: string,
  phoneRaw: string,
): Promise<ClientLookupRow | null> {
  if (!isCompletePhone(phoneRaw)) return null;

  for (const variant of phoneStoredVariants(phoneRaw)) {
    const found = await prisma.client.findUnique({
      where: {
        organizationId_phone: {
          organizationId,
          phone: variant,
        },
      },
      select: clientSelect,
    });
    if (found) return found;
  }

  const national = nationalPhoneDigits(phoneRaw);
  const candidates = await prisma.client.findMany({
    where: { organizationId },
    select: clientSelect,
  });
  return candidates.find((c) => nationalPhoneDigits(c.phone) === national) ?? null;
}

/** Поиск клиентов по полному номеру или по последним 7+ цифрам */
export async function findClientsByPhoneSearch(
  organizationId: string,
  phoneRaw: string,
): Promise<ClientLookupRow[]> {
  if (!isSearchablePhone(phoneRaw)) return [];

  if (isCompletePhone(phoneRaw)) {
    const one = await findClientByPhone(organizationId, phoneRaw);
    return one ? [one] : [];
  }

  const candidates = await prisma.client.findMany({
    where: { organizationId },
    select: clientSelect,
    orderBy: { createdAt: "desc" },
  });
  return candidates.filter((c) => phoneMatchesSearch(phoneRaw, c.phone));
}

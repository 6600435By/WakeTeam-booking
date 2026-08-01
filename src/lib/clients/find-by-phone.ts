import { prisma } from "@/lib/db";
import {
  isCompletePhone,
  isSearchablePhone,
  nationalPhoneDigits,
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

  const variants = phoneStoredVariants(phoneRaw);
  if (variants.length > 0) {
    const hits = await Promise.all(
      variants.map((variant) =>
        prisma.client.findUnique({
          where: {
            organizationId_phone: {
              organizationId,
              phone: variant,
            },
          },
          select: clientSelect,
        }),
      ),
    );
    const found = hits.find((row) => row != null);
    if (found) return found;
  }

  // Indexed suffix match — never scan the whole organization.
  const national = nationalPhoneDigits(phoneRaw);
  if (national.length < 9) return null;
  const candidates = await prisma.client.findMany({
    where: {
      organizationId,
      phone: { endsWith: national },
    },
    select: clientSelect,
    take: 10,
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

  const digits = phoneRaw.replace(/\D/g, "");
  const suffix = digits.slice(-Math.min(digits.length, 9));
  if (suffix.length < 7) return [];

  const candidates = await prisma.client.findMany({
    where: {
      organizationId,
      phone: { endsWith: suffix },
    },
    select: clientSelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return candidates.filter((c) => phoneMatchesSearch(phoneRaw, c.phone));
}

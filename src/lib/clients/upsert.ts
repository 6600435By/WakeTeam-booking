import { prisma } from "@/lib/db";
import { findClientByPhone } from "@/lib/clients/find-by-phone";
import { normalizePhone } from "@/lib/phone";

export type UpsertClientInput = {
  organizationId: string;
  phone: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  notes?: string | null;
};

export async function upsertClientByPhone(input: UpsertClientInput) {
  const canonical = normalizePhone(input.phone);
  const existing = await findClientByPhone(input.organizationId, input.phone);

  if (existing) {
    const phoneUpdate =
      existing.phone !== canonical
        ? await prisma.client
            .findUnique({
              where: {
                organizationId_phone: {
                  organizationId: input.organizationId,
                  phone: canonical,
                },
              },
            })
            .then((conflict) => (conflict && conflict.id !== existing.id ? undefined : canonical))
        : undefined;

    return prisma.client.update({
      where: { id: existing.id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName ?? undefined,
        email: input.email ?? undefined,
        notes: input.notes ?? undefined,
        ...(phoneUpdate ? { phone: phoneUpdate } : {}),
      },
    });
  }

  return prisma.client.create({
    data: {
      organizationId: input.organizationId,
      phone: canonical,
      firstName: input.firstName,
      lastName: input.lastName ?? undefined,
      email: input.email ?? undefined,
      notes: input.notes ?? undefined,
    },
  });
}

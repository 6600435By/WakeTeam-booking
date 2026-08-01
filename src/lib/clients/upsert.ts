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
    const nextFirst = input.firstName;
    const nextLast = input.lastName ?? existing.lastName;
    const nextEmail = input.email !== undefined ? input.email : existing.email;
    const phoneNeedsUpdate = existing.phone !== canonical;

    let phoneUpdate: string | undefined;
    if (phoneNeedsUpdate) {
      const conflict = await prisma.client.findUnique({
        where: {
          organizationId_phone: {
            organizationId: input.organizationId,
            phone: canonical,
          },
        },
        select: { id: true },
      });
      phoneUpdate =
        conflict && conflict.id !== existing.id ? undefined : canonical;
    }

    const unchanged =
      existing.firstName === nextFirst &&
      existing.lastName === nextLast &&
      existing.email === (nextEmail ?? null) &&
      !phoneUpdate &&
      input.notes == null;

    if (unchanged) return existing;

    return prisma.client.update({
      where: { id: existing.id },
      data: {
        firstName: nextFirst,
        lastName: nextLast ?? undefined,
        email: nextEmail ?? undefined,
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

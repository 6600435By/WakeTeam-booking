import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reconcileMembershipOnDelete } from "@/lib/memberships/deduct";
import { splitMinutesEqually } from "@/lib/payroll/branch-wide-spot-tasks";
import { addMinutes } from "@/lib/time";

export type SplitAppointmentResult = {
  firstId: string;
  secondId: string;
  firstDuration: number;
  secondDuration: number;
};

/**
 * Split an appointment (or related group) into two consecutive equal-duration
 * segments sharing a bookingGroupId.
 *
 * @param relatedIds — when the journal shows a consecutive multi-slot block,
 *   pass all visible appointment ids so the full span is split (not only
 *   bookingGroupId members).
 */
export async function splitAppointmentInHalf(
  appointmentId: string,
  relatedIds?: string[],
): Promise<SplitAppointmentResult> {
  const source = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
  });

  let group =
    relatedIds && relatedIds.length > 0
      ? await prisma.appointment.findMany({
          where: {
            id: { in: relatedIds },
            status: { not: "deleted" },
            branchId: source.branchId,
            clientId: source.clientId,
          },
          orderBy: { startAt: "asc" },
        })
      : source.bookingGroupId
        ? await prisma.appointment.findMany({
            where: {
              bookingGroupId: source.bookingGroupId,
              status: { not: "deleted" },
            },
            orderBy: { startAt: "asc" },
          })
        : await prisma.appointment.findMany({
            where: { id: source.id, status: { not: "deleted" } },
          });

  if (!group.length) {
    group = [source];
  }

  const sorted = [...group].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
  const firstStart = sorted[0].startAt;
  const lastEnd = sorted.reduce(
    (max, a) => (a.endAt.getTime() > max.getTime() ? a.endAt : max),
    sorted[0].endAt,
  );
  const totalMinutes = Math.round(
    (lastEnd.getTime() - firstStart.getTime()) / 60_000,
  );

  if (totalMinutes < 2) {
    throw new Error("SPLIT_TOO_SHORT");
  }

  const [firstDuration, secondDuration] = splitMinutesEqually(totalMinutes, 2);
  if (firstDuration < 1 || secondDuration < 1) {
    throw new Error("SPLIT_TOO_SHORT");
  }

  const groupId = source.bookingGroupId ?? randomUUID();
  const keepId = sorted[0].id;
  const removeIds = sorted.slice(1).map((a) => a.id);
  const secondStart = addMinutes(firstStart, firstDuration);
  const firstEnd = secondStart;
  const secondEnd = addMinutes(secondStart, secondDuration);

  try {
    for (const id of removeIds) {
      await reconcileMembershipOnDelete(id);
    }
    if (sorted[0].membershipId) {
      await reconcileMembershipOnDelete(keepId);
    }

    const second = await prisma.$transaction(async (tx) => {
      if (removeIds.length) {
        await tx.appointment.updateMany({
          where: { id: { in: removeIds } },
          data: {
            status: "deleted",
            cancelReason: "admin",
            membershipId: null,
            membershipMinutesDeducted: 0,
          },
        });
      }

      await tx.appointment.update({
        where: { id: keepId },
        data: {
          startAt: firstStart,
          endAt: firstEnd,
          durationMinutes: firstDuration,
          bookingGroupId: groupId,
          membershipId: null,
          membershipMinutesDeducted: 0,
          paymentMethod: null,
          cashAmount: 0,
          cardAmount: 0,
          price: 0,
          rentalItemId: null,
          rentalQuantity: 0,
          rentalAmount: 0,
        },
      });

      return tx.appointment.create({
        data: {
          organizationId: source.organizationId,
          branchId: source.branchId,
          clientId: source.clientId,
          staffId: sorted[0].staffId,
          serviceId: sorted[0].serviceId,
          startAt: secondStart,
          endAt: secondEnd,
          durationMinutes: secondDuration,
          price: 0,
          cashAmount: 0,
          cardAmount: 0,
          status: sorted[0].status === "deleted" ? "booked" : sorted[0].status,
          source: sorted[0].source,
          comment: sorted[0].comment,
          bookingGroupId: groupId,
          operatorMemberId: sorted[0].operatorMemberId,
        },
      });
    });

    return {
      firstId: keepId,
      secondId: second.id,
      firstDuration,
      secondDuration,
    };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("SPLIT_SLOT_UNAVAILABLE");
    }
    throw e;
  }
}

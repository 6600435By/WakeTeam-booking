import { prisma } from "@/lib/db";
import { effectiveRemainingMinutes } from "./effective";

const DEDUCT_STATUSES = new Set(["in_service", "completed"]);

export function statusTriggersDeduction(status: string): boolean {
  return DEDUCT_STATUSES.has(status);
}

export async function rollbackMembershipDeduction(appointmentId: string): Promise<void> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      membershipId: true,
      membershipMinutesDeducted: true,
    },
  });
  if (!appt?.membershipId || appt.membershipMinutesDeducted <= 0) return;

  const minutes = appt.membershipMinutesDeducted;
  await prisma.$transaction([
    prisma.membership.update({
      where: { id: appt.membershipId },
      data: { localDeductedMinutes: { decrement: minutes } },
    }),
    prisma.appointment.update({
      where: { id: appointmentId },
      data: { membershipMinutesDeducted: 0 },
    }),
    prisma.membershipTransaction.create({
      data: {
        membershipId: appt.membershipId,
        appointmentId,
        minutes: -minutes,
        reason: "rollback",
      },
    }),
  ]);
}

export async function applyMembershipDeductionIfNeeded(
  appointmentId: string,
  newStatus: string,
): Promise<void> {
  if (!statusTriggersDeduction(newStatus)) return;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      membershipId: true,
      membershipMinutesDeducted: true,
      durationMinutes: true,
    },
  });
  if (!appt?.membershipId || appt.membershipMinutesDeducted > 0) return;

  const minutes = appt.durationMinutes;
  const membership = await prisma.membership.findUniqueOrThrow({
    where: { id: appt.membershipId },
  });

  const effective = effectiveRemainingMinutes(
    membership.sheetRemainingMinutes,
    membership.localDeductedMinutes,
  );
  if (minutes > effective) {
    throw new Error("MEMBERSHIP_INSUFFICIENT_MINUTES");
  }

  await prisma.$transaction([
    prisma.membership.update({
      where: { id: appt.membershipId },
      data: { localDeductedMinutes: { increment: minutes } },
    }),
    prisma.appointment.update({
      where: { id: appointmentId },
      data: { membershipMinutesDeducted: minutes },
    }),
    prisma.membershipTransaction.create({
      data: {
        membershipId: appt.membershipId,
        appointmentId,
        minutes,
        reason: "deduct",
      },
    }),
  ]);
}

export async function reconcileMembershipOnStatusChange(
  appointmentId: string,
  previousStatus: string,
  newStatus: string,
): Promise<void> {
  const wasDeducting = statusTriggersDeduction(previousStatus);
  const shouldDeduct = statusTriggersDeduction(newStatus);

  if (wasDeducting && !shouldDeduct) {
    await rollbackMembershipDeduction(appointmentId);
    return;
  }
  if (shouldDeduct) {
    await applyMembershipDeductionIfNeeded(appointmentId, newStatus);
  }
}

export async function reconcileMembershipOnDelete(appointmentId: string): Promise<void> {
  await rollbackMembershipDeduction(appointmentId);
}

export async function setAppointmentMembership(
  appointmentId: string,
  membershipId: string | null,
): Promise<void> {
  const appt = await prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    select: {
      status: true,
      membershipId: true,
      membershipMinutesDeducted: true,
    },
  });

  if (appt.membershipId === membershipId) return;

  if (appt.membershipMinutesDeducted > 0) {
    await rollbackMembershipDeduction(appointmentId);
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { membershipId },
  });

  if (membershipId && statusTriggersDeduction(appt.status)) {
    await applyMembershipDeductionIfNeeded(appointmentId, appt.status);
  }
}

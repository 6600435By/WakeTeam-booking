import { prisma } from "@/lib/db";
import type { DbClient } from "@/lib/db-types";
import type { PrismaClient } from "@prisma/client";
import { effectiveRemainingMinutes } from "./effective";

const DEDUCT_STATUSES = new Set(["in_service", "completed"]);

export function statusTriggersDeduction(status: string): boolean {
  return DEDUCT_STATUSES.has(status);
}

export function hasSufficientMembershipMinutes(
  sheetRemainingMinutes: number,
  localDeductedMinutes: number,
  minutes: number,
): boolean {
  return minutes <= effectiveRemainingMinutes(sheetRemainingMinutes, localDeductedMinutes);
}

function isRootClient(db: DbClient): db is PrismaClient {
  return "$transaction" in db;
}

async function atomicIncrementDeduction(
  db: DbClient,
  membershipId: string,
  minutes: number,
): Promise<void> {
  const updated = await db.$executeRaw`
    UPDATE Membership
    SET localDeductedMinutes = localDeductedMinutes + ${minutes}
    WHERE id = ${membershipId}
      AND (sheetRemainingMinutes - localDeductedMinutes) >= ${minutes}
  `;
  if (Number(updated) === 0) {
    throw new Error("MEMBERSHIP_INSUFFICIENT_MINUTES");
  }
}

async function atomicDecrementDeduction(
  db: DbClient,
  membershipId: string,
  minutes: number,
): Promise<void> {
  const updated = await db.$executeRaw`
    UPDATE Membership
    SET localDeductedMinutes = localDeductedMinutes - ${minutes}
    WHERE id = ${membershipId}
      AND localDeductedMinutes >= ${minutes}
  `;
  if (Number(updated) === 0) {
    throw new Error("MEMBERSHIP_ROLLBACK_FAILED");
  }
}

async function rollbackMembershipDeductionTx(
  db: DbClient,
  appointmentId: string,
): Promise<void> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      membershipId: true,
      membershipMinutesDeducted: true,
    },
  });
  if (!appt?.membershipId || appt.membershipMinutesDeducted <= 0) return;

  const minutes = appt.membershipMinutesDeducted;
  await atomicDecrementDeduction(db, appt.membershipId, minutes);
  await db.appointment.update({
    where: { id: appointmentId },
    data: { membershipMinutesDeducted: 0 },
  });
  await db.membershipTransaction.create({
    data: {
      membershipId: appt.membershipId,
      appointmentId,
      minutes: -minutes,
      reason: "rollback",
    },
  });
}

export async function rollbackMembershipDeduction(
  appointmentId: string,
  db: DbClient = prisma,
): Promise<void> {
  if (isRootClient(db)) {
    await db.$transaction((tx) => rollbackMembershipDeductionTx(tx, appointmentId));
    return;
  }
  await rollbackMembershipDeductionTx(db, appointmentId);
}

async function applyMembershipDeductionIfNeededTx(
  db: DbClient,
  appointmentId: string,
): Promise<void> {
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      membershipId: true,
      membershipMinutesDeducted: true,
      durationMinutes: true,
    },
  });
  if (!appt?.membershipId || appt.membershipMinutesDeducted > 0) return;

  const minutes = appt.durationMinutes;
  await atomicIncrementDeduction(db, appt.membershipId, minutes);
  await db.appointment.update({
    where: { id: appointmentId },
    data: { membershipMinutesDeducted: minutes },
  });
  await db.membershipTransaction.create({
    data: {
      membershipId: appt.membershipId,
      appointmentId,
      minutes,
      reason: "deduct",
    },
  });
}

export async function applyMembershipDeductionIfNeeded(
  appointmentId: string,
  newStatus: string,
  db: DbClient = prisma,
): Promise<void> {
  if (!statusTriggersDeduction(newStatus)) return;

  if (isRootClient(db)) {
    await db.$transaction((tx) => applyMembershipDeductionIfNeededTx(tx, appointmentId));
    return;
  }
  await applyMembershipDeductionIfNeededTx(db, appointmentId);
}

export async function reconcileMembershipOnStatusChange(
  appointmentId: string,
  previousStatus: string,
  newStatus: string,
  db: DbClient = prisma,
): Promise<void> {
  const wasDeducting = statusTriggersDeduction(previousStatus);
  const shouldDeduct = statusTriggersDeduction(newStatus);

  if (wasDeducting && !shouldDeduct) {
    await rollbackMembershipDeduction(appointmentId, db);
    return;
  }
  if (shouldDeduct) {
    await applyMembershipDeductionIfNeeded(appointmentId, newStatus, db);
  }
}

export async function reconcileMembershipOnDelete(
  appointmentId: string,
  db: DbClient = prisma,
): Promise<void> {
  await rollbackMembershipDeduction(appointmentId, db);
}

export async function setAppointmentMembership(
  appointmentId: string,
  membershipId: string | null,
  db: DbClient = prisma,
): Promise<void> {
  const appt = await db.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    select: {
      status: true,
      membershipId: true,
      membershipMinutesDeducted: true,
    },
  });

  if (appt.membershipId === membershipId) return;

  if (appt.membershipMinutesDeducted > 0) {
    await rollbackMembershipDeduction(appointmentId, db);
  }

  await db.appointment.update({
    where: { id: appointmentId },
    data: { membershipId },
  });

  if (membershipId && statusTriggersDeduction(appt.status)) {
    await applyMembershipDeductionIfNeeded(appointmentId, appt.status, db);
  }
}
